import { IDBPDatabase } from 'idb/with-async-ittr'

import { Mutex, MutexFactory } from '@ink-feather-org/ts-mutex'
import { PromiseChain, delay } from '@ink-feather-org/ts-utils'

export class IDBMutex implements Mutex {
  private readonly promiseChain = new PromiseChain()

  private readonly mutexID = `${Math.random()}-${new Date().getUTCMilliseconds()}`

  private owns = false

  /**
   * This expects the store to already exist.
   */
  constructor(private readonly db: IDBPDatabase, private readonly storeName: string, private readonly identifier: string) {}

  has(): Promise<boolean> {
    return this.promiseChain.enqueue(() => Promise.resolve(this.owns))
  }

  lock(): Promise<boolean> {
    return this.promiseChain.enqueue(async () => {
      let untouched = true
      while (!this.owns) {
        const tx = this.db.transaction(this.storeName, 'readwrite')
        const current = await tx.store.get(this.identifier) || {}
        if (current.currentLocker === undefined) {
          this.owns = true
          current.currentLocker = this.mutexID
          untouched = current.lastLocker === this.mutexID
          current.lastLocker = this.mutexID
          await tx.store.put(current, this.identifier)
        }
        await tx.done
        await delay(100)
      }
      return untouched
    })
  }

  release(force?: boolean): Promise<void> {
    return this.promiseChain.enqueue(async () => {
      const tx = this.db.transaction(this.storeName, 'readwrite')
      const current = await tx.store.get(this.identifier) || {}
      if (force)
        current.lastLocker = undefined
      else {
        if (!this.owns)
          throw Error('Double freed!')
        if (current.currentLocker !== this.mutexID)
          throw Error('Mutex lost ownership!')
      }
      current.currentLocker = undefined
      await tx.store.put(current, this.identifier)
      await tx.done
      this.owns = false
    })
  }

  static factory(db: IDBPDatabase, storeName: string, identifier: string): MutexFactory<IDBMutex> {
    return {
      createMutex() {
        return new IDBMutex(db, storeName, identifier)
      },
    }
  }
}
