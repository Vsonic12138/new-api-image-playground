import i18n from 'i18next'
import type { ApiProtocol, AppSettings, AssetRef, ImageProgressPhase, ResolvedProtocol, WorkMode } from '../types'
import { saveImageResponse, saveBlob, fileFromAsset } from '../lib/image-store'
import {
  endpoint, isMockMode, parseChatResult, parseImagesResponse, parseResponsesResult,
  postJSON, postMultipart, toDataURL,
} from './protocols'

export { isMockMode } from './protocols'
const SAMPLE_URLS = ['robot-room.webp', 'robot-sky.webp', 'robot-night.webp', 'robot-edit.webp']
  .map(file => `${import.meta.env.BASE_URL}samples/${file}`)
let samplePointer = 0
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type ImageTaskResult = { images: AssetRef[]; protocol: ResolvedProtocol; responseId?: string; text?: string }
export type ChatTaskResult = { text: string; protocol: 'chat'|'responses'; responseId?: string }

function imageProtocol(preference: ApiProtocol): 'images'|'responses' {
  if (preference === 'auto' || preference === 'images') return 'images'
  if (preference === 'chat') {
    // OpenAI Chat Completions has no standardized generated-image output.
    // Vendor Chat image extensions require an administrator-verified adapter.
    throw new Error('当前 Chat 协议没有已验证的图片输出适配器。请选择 Images 或 Responses。')
  }
  return preference
}
async function storeImages(
  results: Array<{b64_json?:string;url?:string}>,
  meta: {model:string;protocol:ResolvedProtocol;responseId?:string;parentId?:string},
): Promise<AssetRef[]> {
  return Promise.all(results.map(async item => ({
    ...await saveImageResponse(item,meta.parentId),
    model:meta.model,
    protocol:meta.protocol,
    responseId:meta.responseId,
  })))
}

function responsesInput(prompt: string, imageDataURL?: string, history?: Array<{role:'user'|'assistant';content:string}>) {
  const prior = (history || []).slice(-10).map(turn => ({role:turn.role, content:turn.content}))
  return [...prior, {
    role:'user',
    content:[
      {type:'input_text',text:prompt},
      ...(imageDataURL ? [{type:'input_image',image_url:imageDataURL}] : []),
    ],
  }]
}

export async function createImages(
  prompt: string, settings: AppSettings, onProgress?: (phase: ImageProgressPhase)=>void,
): Promise<ImageTaskResult> {
  const protocol = imageProtocol(settings.imageProtocol)
  onProgress?.('preparing')
  if (isMockMode) {
    await sleep(260)
    onProgress?.('requesting')
    await sleep(1050)
    onProgress?.('saving')
    await sleep(380)
    const images: AssetRef[] = Array.from({length:settings.count},(_,i)=>({
      id:`sample-${Date.now()}-${i}`,
      src:SAMPLE_URLS[(samplePointer++) % SAMPLE_URLS.length],
      createdAt:Date.now(), model:settings.imageModel, protocol,
    }))
    return {images,protocol}
  }
  onProgress?.('requesting')
  let raw
  if (protocol === 'images') {
    raw = parseImagesResponse(await postJSON(endpoint('images','generate'), {
      model:settings.imageModel, prompt, n:settings.count,size:settings.size,
    }))
  } else {
    raw = parseResponsesResult(await postJSON(endpoint('responses'), {
      model:settings.responsesModel,
      input:responsesInput(prompt),
      tools:[{type:'image_generation',model:settings.imageModel,action:'generate',size:settings.size}],
      tool_choice:{type:'image_generation'},
      store:true,
    }))
  }
  if (!raw.images.length) throw new Error('模型没有返回生成的图片；请检查 Responses 主模型是否支持 image_generation 工具')
  onProgress?.('saving')
  return {
    images: await storeImages(raw.images,{model:settings.imageModel,protocol,responseId:raw.responseId}),
    protocol,responseId:raw.responseId,text:raw.text,
  }
}

export async function editImages(
  prompt:string, image:AssetRef, settings:AppSettings, annotated?:Blob,
  onProgress?: (phase:ImageProgressPhase)=>void,
): Promise<ImageTaskResult> {
  const protocol = imageProtocol(settings.imageProtocol)
  onProgress?.('preparing')
  if (isMockMode) {
    await sleep(280)
    onProgress?.('requesting')
    await sleep(1150)
    onProgress?.('saving')
    await sleep(380)
    const images: AssetRef[] = [{
      id:`sample-edit-${Date.now()}`,src:SAMPLE_URLS[(samplePointer++) % SAMPLE_URLS.length],
      parentId:image.id, createdAt:Date.now(),model:settings.imageModel,protocol,
    }]
    return {images,protocol}
  }
  const file = annotated ? new File([annotated],'annotated.png',{type:'image/png'}) : await fileFromAsset(image)
  onProgress?.('requesting')
  let raw
  if (protocol === 'images') {
    const form = new FormData()
    form.append('model',settings.imageModel)
    form.append('prompt',prompt)
    form.append('image',file)
    form.append('n',String(settings.count))
    form.append('size',settings.size)
    raw = parseImagesResponse(await postMultipart(endpoint('images','edit'),form))
  } else {
    raw = parseResponsesResult(await postJSON(endpoint('responses'), {
      model:settings.responsesModel,
      input:responsesInput(prompt,await toDataURL(file)),
      tools:[{type:'image_generation',model:settings.imageModel,action:'edit',size:settings.size}],
      tool_choice:{type:'image_generation'},
      store:true,
    }))
  }
  if (!raw.images.length) throw new Error('模型没有返回编辑后的图片；请核对模型的图像工具能力')
  onProgress?.('saving')
  return {
    images:await storeImages(raw.images,{model:settings.imageModel,protocol,parentId:image.id,responseId:raw.responseId}),
    protocol,responseId:raw.responseId,text:raw.text,
  }
}

export async function sendChat(
  prompt:string,history:Array<{role:'user'|'assistant';content:string}>,settings:AppSettings,
  reference?:AssetRef,
): Promise<ChatTaskResult> {
  const protocol = settings.chatProtocol
  if (isMockMode) {
    await sleep(580)
    return {text:i18n.t('mockChatReply',{ns:'imagePlayground',prompt}),protocol}
  }
  const imageURL = reference ? await toDataURL(await fileFromAsset(reference)) : undefined
  if (protocol === 'chat') {
    const messages = history.slice(-12).map(item=>({role:item.role,content:item.content}))
    const content = imageURL ? [
      {type:'text',text:prompt},
      {type:'image_url',image_url:{url:imageURL}},
    ] : prompt
    const raw = parseChatResult(await postJSON(endpoint('chat'),{
      model:settings.chatModel,stream:false,messages:[...messages,{role:'user',content}],
    }))
    if (!raw.text) throw new Error('聊天模型返回了空内容')
    return {text:raw.text,protocol}
  }
  const raw = parseResponsesResult(await postJSON(endpoint('responses'),{
    model:settings.responsesModel,input:responsesInput(prompt,imageURL,history),store:true,
  }))
  if (!raw.text) throw new Error('Responses 模型返回了空文本')
  return {text:raw.text,protocol,responseId:raw.responseId}
}

export async function importImage(file:File):Promise<AssetRef> {
  if (!file.type.startsWith('image/')) throw new Error('只支持上传图片文件')
  if (file.size > 15*1024*1024) throw new Error('图片不能超过 15MB')
  return saveBlob(file)
}
export function modeLabel(mode:WorkMode) {
  return mode === 'generate'?'生图':mode === 'edit'?'修图':'对话'
}
