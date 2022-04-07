/* Copyright 2021 The @ink-feather-org/ts-mutex Contributors.
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */

import { Mutex } from './Mutex'
import { MutexFactory } from './MutexFactory'

/**
 * If mutexes are constantly being created, locked and destroyed this could grow in size and require some cleanup.
 */
const locks = new Map<string, {
  lastLocker?: RAMMutex,
  currentLocker?: RAMMutex,
  queued:Array<() => void>
}>()

export class RAMMutex implements Mutex {
  private owns = false

  constructor(private readonly identifier: string) {
    if (!locks.get(this.identifier))
      locks.set(this.identifier, { queued: [], })
  }

  async has(): Promise<boolean> {
    return this.owns
  }

  lock(): Promise<boolean> {
    if (this.owns)
      return Promise.resolve(true)
    return new Promise((resolve => {
      const lockInstance = locks.get(this.identifier)!
      const lockIt = () => {
        this.owns = true
        lockInstance.currentLocker = this
        const untouched = lockInstance.lastLocker === this
        lockInstance.lastLocker = this
        resolve(untouched)
      }
      if (lockInstance.currentLocker === this)
        resolve(true)
      else if (!lockInstance.currentLocker)
        lockIt()
      else
        lockInstance.queued.push(lockIt)
    }))
  }

  async release(force?: boolean) {
    const lockInstance = locks.get(this.identifier)!
    if (force)
      lockInstance.lastLocker = undefined
    else {
      if (!this.owns)
        throw Error('Double freed!')
      if (lockInstance.currentLocker !== this)
        throw Error('Mutex lost ownership!')
    }
    lockInstance.currentLocker = undefined
    this.owns = false
    const nextLocker = lockInstance.queued.shift()
    if (nextLocker)
      nextLocker()
  }

  static factory(identifier: string): MutexFactory<RAMMutex> {
    return {
      createMutex() {
        return new RAMMutex(identifier)
      },
    }
  }
}
