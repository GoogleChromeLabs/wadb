/*
 * Copyright 2020 Google Inc. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

type Resolver<T> = (value?: T) => void;

class QueueEntry<T> {
  data: T;
  next?: QueueEntry<T>

  constructor(data: T) {
    this.data = data;
  }
}

/**
 * A linked queue implementation.
 */
export class Queue<T> {
  head?: QueueEntry<T>;
  tail?: QueueEntry<T>;

  /**
   * Adds an item to the queue.
   * @param data
   */
  enqueue(data: T): void {
    const newNode = new QueueEntry<T>(data);
    if (this.tail) {
      this.tail.next = newNode;
    }
    this.tail = newNode;

    // Queue is empty. Initialise the head.
    if (!this.head) {
      this.head = this.tail;
    }
  }

  /**
   * Removes an item from the queue and returns it.
   * @returns {T} the removed item.
   * @throws an error if the list is empty.
   */
  dequeue(): T {
    if (this.isEmpty()) {
      throw new Error('Cannot dequeue. Queue is empty');
    }
    const node = this.head!.data;
    this.head = this.head!.next;
    return node;
  }

  /**
   * Checks if the Queues is empty
   * @returns {boolean} true if the Queue is empty.
   */
  isEmpty(): boolean {
    return this.head == null;
  }
}

/**
 * The AsyncBlockingQueue implements a queue with an asynchronous programming model. Items can
 * be added to the Queue as usual. When dequeing, a Promise is returned.
 *
 * The promise will resolve instantly if the Queue is not empty. If the Queue is empty, the Promise
 * will be resolved when a new item is added to the queue.
 */
export class AsyncBlockingQueue<T> {
  private promiseQueue: Queue<Promise<T>> = new Queue<Promise<T>>();
  private resolverQueue: Queue<Resolver<T>> = new Queue<Resolver<T>>();

  private add(): void {
    const promise = new Promise<T>(resolve => {
      this.resolverQueue.enqueue(resolve);
    });
    this.promiseQueue.enqueue(promise);
  }

  /**
   * Enqueues an item
   * @param data
   */
  enqueue(data: T): void {
    if (this.resolverQueue.isEmpty()) {
      this.add();
    }
    const resolve = this.resolverQueue.dequeue();
    resolve(data);
  }

  /**
   * Asynchronously dequeues an item. If the queue is empty, the returned Promise is resolved when
   * an item is added. Otherwise, it will return one o the existing items.
   * @returns {Promise<T>} that resolves to the data.
   */
  async dequeue(): Promise<T> {
    if (this.promiseQueue.isEmpty()) {
      this.add();
    }
    return this.promiseQueue.dequeue();
  }

  hasPendingPromises(): boolean {
    return !this.promiseQueue.isEmpty();
  }

  hasPendingResolvers(): boolean {
    return !this.resolverQueue.isEmpty();
  }
}
