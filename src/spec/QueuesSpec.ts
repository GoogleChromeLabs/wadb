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

import {Queue, AsyncBlockingQueue} from '../lib/Queues';

describe('Queues', () => {
  describe('Queue', () => {
    describe('#constructor', () => {
      it('Builds an empty queue', () => {
        const queue = new Queue<string>();
        expect(queue.isEmpty()).toBeTrue();
      });
    });

    describe('#enqueue', () => {
      it('Queue is not empty after enqueing an item', () => {
        const queue = new Queue<string>();
        queue.enqueue('test');
        expect(queue.isEmpty()).toBeFalse();
      });
    });

    describe('#dequeue', () => {
      it('Throws Error when dequeing an empty list', () => {
        const queue = new Queue<string>();
        expect(queue.dequeue).toThrowError();
      });

      it('Dequeues with one value', () => {
        const queue = new Queue<string>();
        queue.enqueue('one');
        expect(queue.dequeue()).toBe('one');
        expect(queue.isEmpty()).toBeTrue();
      });

      it('Dequeues in the correct order', () => {
        const queue = new Queue<string>();
        queue.enqueue('one');
        queue.enqueue('two');
        expect(queue.dequeue()).toBe('one');
        expect(queue.dequeue()).toBe('two');
        queue.enqueue('three');
        expect(queue.dequeue()).toBe('three');
        expect(queue.isEmpty()).toBeTrue();
      });
    });
  });

  describe('AsyncBlockingQueue', () => {
    describe('#contructor', () => {
      it('Constructs and empty queue', () => {
        const queue = new AsyncBlockingQueue<string>();
        expect(queue.hasPendingPromises()).toBeFalse();
        expect(queue.hasPendingResolvers()).toBeFalse();
      });
    });

    describe('#enqueue', () => {
      it('enqueue adds a pending Promise', () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.enqueue('test');
        expect(queue.hasPendingPromises()).toBeTrue();
        expect(queue.hasPendingResolvers()).toBeFalse();
      });

      it('enqueue after dequeue clears Promises and Resolvers', () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.dequeue();
        queue.enqueue('test');
        expect(queue.hasPendingPromises()).toBeFalse();
        expect(queue.hasPendingResolvers()).toBeFalse();
      });
    });

    describe('#dequeue', () => {
      it('dequeue adds a pending Resolver', () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.dequeue();
        expect(queue.hasPendingPromises()).toBeFalse();
        expect(queue.hasPendingResolvers()).toBeTrue();
      });

      it('dequeue after enqueue clears Promises and Resolvers', () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.enqueue('test');
        queue.dequeue();
        expect(queue.hasPendingPromises()).toBeFalse();
        expect(queue.hasPendingResolvers()).toBeFalse();
      });

      it('Dequeues correctly after enqueue', async () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.enqueue('test');
        const value = await queue.dequeue();
        expect(value).toBe('test');
      });

      it('Dequeues correctly after enqueue', async () => {
        const queue = new AsyncBlockingQueue<string>();
        const promise = queue.dequeue();
        queue.enqueue('test');
        const value = await promise;
        expect(value).toBe('test');
      });

      it('Dequeues in the correct order, with enqueues then dequeues', async () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.enqueue('one');
        queue.enqueue('two');
        expect(await queue.dequeue()).toBe('one');
        expect(await queue.dequeue()).toBe('two');
      });

      it('Dequeues in the correct order, enqueue > dequeue > dequeue > enqueue', async () => {
        const queue = new AsyncBlockingQueue<string>();
        queue.enqueue('one');
        expect(await queue.dequeue()).toBe('one');
        const promise = queue.dequeue();
        queue.enqueue('two');
        expect(await promise).toBe('two');
      });

      it('Dequeues in the correct order, dequeue > dequeue > enqueue > enqueue', async () => {
        const queue = new AsyncBlockingQueue<string>();
        const p1 = queue.dequeue();
        const p2 = queue.dequeue();

        queue.enqueue('one');
        queue.enqueue('two');

        expect(await p1).toBe('one');
        expect(await p2).toBe('two');
      });
    });
  });
});
