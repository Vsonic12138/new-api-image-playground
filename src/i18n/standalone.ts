import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { imagePlaygroundResources, normalizeLanguage } from './resources'

// Standalone entry only. In New API, the existing i18next instance stays the owner.
// Add resource bundles to that instance instead of importing this initializer.
if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: imagePlaygroundResources,
      defaultNS: 'imagePlayground',
      ns: ['imagePlayground'],
      fallbackLng: 'en',
      supportedLngs: ['en','zhCN','fr','ru','ja','vi','zhTW'],
      load: 'currentOnly',
      interpolation: { escapeValue:false },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
        convertDetectedLanguage: normalizeLanguage,
      },
    })
}
export default i18n
