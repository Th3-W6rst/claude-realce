import { setLanguage } from '../hooks/i18n'

// The suite was written against the Portuguese interface: each test pins it, the plugin's worker through its store
// (`mock.store(on, PT)`), and the functions a test calls directly through this copy of the module, at import.
export const PT = { language: 'pt' } as const

setLanguage('pt')
