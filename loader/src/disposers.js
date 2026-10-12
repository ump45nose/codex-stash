export function createDisposers() {
  const list = []
  return {
    add(fn) {
      list.push(fn)
      return () => {
        const index = list.indexOf(fn)
        if (index >= 0) list.splice(index, 1)
      }
    },
    run() {
      while (list.length) {
        const fn = list.pop()
        try {
          fn()
        } catch {
          /* one disposer must not block the rest */
        }
      }
    },
  }
}
