import type { EngineInterface, FsBytes } from 'claude-code'

// Every engine call that reaches past drawing goes through here: processes, files, the network, the model, settings,
// the store, the session and the screen's side effects. `claude plugin validate` names the function each call sits in
// and cuts its report at about 1,000 characters; one short name per call keeps the whole list of what the mod reaches
// readable, by the validator and by the catalogues that read it. Calls made right in a hook (state, resolve) stay there.

type E = EngineInterface

export function exec($: E, ...args: Parameters<E['process']['run']>): ReturnType<E['process']['run']> {
  return $.process.run(...args)
}

export function exists($: E, ...args: Parameters<E['fs']['exists']>): ReturnType<E['fs']['exists']> {
  return $.fs.exists(...args)
}

export function readFile($: E, path: string): Promise<string>
export function readFile($: E, path: string, as: 'bytes'): Promise<FsBytes>
export function readFile($: E, path: string, as?: 'bytes'): Promise<string | FsBytes> {
  return as === 'bytes' ? $.fs.read(path, { as: 'bytes' }) : $.fs.read(path)
}

export function writeFile($: E, ...args: Parameters<E['fs']['write']>): ReturnType<E['fs']['write']> {
  return $.fs.write(...args)
}

// $.env.get takes its name as a literal (the validator lists the variables read): one branch per variable.
export function envVar($: E, name: 'HOME' | 'COLORTERM') {
  return name === 'HOME' ? $.env.get('HOME') : $.env.get('COLORTERM')
}

/** Runs `work` outside the dispatch that asked for it: a hook answers now and the slow part goes on alone. */
export function detach($: E, work: () => void): void {
  $.clock.after(0, work)
}

export function transcript($: E) {
  return $.session.messages()
}

export function storeGet($: E, ...args: Parameters<E['store']['get']>): ReturnType<E['store']['get']> {
  return $.store.get(...args)
}

export function storeSet($: E, ...args: Parameters<E['store']['set']>): ReturnType<E['store']['set']> {
  return $.store.set(...args)
}

export function redraw($: E, ...args: Parameters<E['ui']['invalidate']>): ReturnType<E['ui']['invalidate']> {
  return $.ui.invalidate(...args)
}

export function logLine($: E, ...args: Parameters<E['ui']['log']>): ReturnType<E['ui']['log']> {
  return $.ui.log(...args)
}

export function toast($: E, ...args: Parameters<E['ui']['toast']>): ReturnType<E['ui']['toast']> {
  return $.ui.toast(...args)
}

export function copyText($: E, ...args: Parameters<E['ui']['copy']>): ReturnType<E['ui']['copy']> {
  return $.ui.copy(...args)
}

export function openPane($: E, ...args: Parameters<E['ui']['open']>): ReturnType<E['ui']['open']> {
  return $.ui.open(...args)
}

export function selected($: E, ...args: Parameters<E['ui']['selection']>): ReturnType<E['ui']['selection']> {
  return $.ui.selection(...args)
}

export function listAgents($: E) {
  return $.agent.list()
}

export function every($: E, ...args: Parameters<E['clock']['every']>): ReturnType<E['clock']['every']> {
  return $.clock.every(...args)
}

export function addCommand($: E, ...args: Parameters<E['command']['register']>): ReturnType<E['command']['register']> {
  return $.command.register(...args)
}

export function configs($: E) {
  return $.config.list()
}

export function fetchUrl($: E, ...args: Parameters<E['http']['fetch']>): ReturnType<E['http']['fetch']> {
  return $.http.fetch(...args)
}

export function complete($: E, ...args: Parameters<E['model']['complete']>): ReturnType<E['model']['complete']> {
  return $.model.complete(...args)
}

export function fork($: E, ...args: Parameters<E['model']['fork']>): ReturnType<E['model']['fork']> {
  return $.model.fork(...args)
}

export function spawn($: E, ...args: Parameters<E['agent']['spawn']>): ReturnType<E['agent']['spawn']> {
  return $.agent.spawn(...args)
}

export function fill($: E, ...args: Parameters<E['prompt']['fill']>): ReturnType<E['prompt']['fill']> {
  return $.prompt.fill(...args)
}

export function compose($: E) {
  return $.prompt.compose()
}

export function submit($: E, ...args: Parameters<E['prompt']['submit']>): ReturnType<E['prompt']['submit']> {
  return $.prompt.submit(...args)
}

export function sessionId($: E) {
  return $.session.id()
}

export function ccVersion($: E) {
  return $.session.version()
}

export function panes($: E) {
  return $.ui.panes()
}

export function closePane($: E, ...args: Parameters<E['ui']['close']>): ReturnType<E['ui']['close']> {
  return $.ui.close(...args)
}

export function notify($: E, ...args: Parameters<E['ui']['notify']>): ReturnType<E['ui']['notify']> {
  return $.ui.notify(...args)
}

export function scrollTo($: E, ...args: Parameters<E['ui']['scroll']>): ReturnType<E['ui']['scroll']> {
  return $.ui.scroll(...args)
}
