import { setLanguage } from '../hooks/i18n'

// The suite was written against the Portuguese interface: each test pins it, the plugin's worker through its store
// (`mock.store(on, PT)`), and the functions a test calls directly through this copy of the module, at import.
export const PT = { language: 'pt' } as const

// Explained errors and "Needs you" start off (people found them noisy): a test of either turns them on in the store.
export const OPT_IN = { erros: true, pendencias: true } as const
export const PT_ALL = { ...PT, flags: OPT_IN } as const

setLanguage('pt')
