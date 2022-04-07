/* Copyright 2021 The @ink-feather-org/ts-mutex Contributors.
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */

import { PromiseChain } from '@ink-feather-org/ts-utils'
import { Mutex } from './Mutex'
import { MutexFactory } from './MutexFactory'

export class NavigatorMutex implements Mutex {
  private readonly promiseChain = new PromiseChain()

  private hasLock?: (value?: (PromiseLike<void> | void)) => void

  constructor(private readonly identifier: string) {
    if (!NavigatorMutex.available())
      throw Error('Not available!')
  }

  has(): Promise<boolean> {
    return this.promiseChain.enqueue(() => Promise.resolve(!!this.hasLock))
  }

  lock(): Promise<boolean> {
    return this.promiseChain.enqueue(() => {
      if (this.hasLock)
        return Promise.resolve(true)
      return new Promise(((resolve) => {
        (navigator as any).locks.request(this.identifier, () => new Promise((release) => {
          this.hasLock = release
          resolve(false)
        }))
      }))
    })
  }

  release(force?: boolean) {
    return this.promiseChain.enqueue(async () => {
      if (force)
        (navigator as any).locks.request(this.identifier, { steal: true, }, () => true)
      else if (!this.hasLock)
        throw Error('Double freed!')
      else
        this.hasLock()
      this.hasLock = undefined
    })
  }

  static available(): boolean {
    return (window.navigator as any).locks
  }

  static factory(identifier: string): MutexFactory<NavigatorMutex> {
    return {
      createMutex() {
        return new NavigatorMutex(identifier)
      },
    }
  }
}
