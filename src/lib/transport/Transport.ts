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

/**
 * A transport layer for data. Implementations must provide a read and write method.
 */
export interface Transport {
  /**
   * Writes data to the transport layer.
   * @param {DataView} data the data to be written to the layer.
   */
  write(data: ArrayBuffer): Promise<void>;

  /**
   * Reands `len` bytes from the transport layer.
   * @param {number} len the number of bytes to read.
   */
  read(len: number): Promise<DataView>;
}
