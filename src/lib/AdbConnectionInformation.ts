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

const PRODUCT_NAME_KEY = 'ro.product.name';
const PRODUCT_MODEL_KEY = 'ro.product.model';
const PRODUCT_DEVICE_KEY = 'ro.product.device';
const FEATURES_KEY = 'features';
const DEFAULT_PRODUCT_VALUE = '<unkwnown>';

export class AdbConnectionInformation {
  constructor(
    readonly productName: string,
    readonly productDevice: string,
    readonly productModel: string,
    readonly features: string[]
    ){

    }

  static fromDataView(input: DataView): AdbConnectionInformation {
    const textDecoder = new TextDecoder();
    const decodedInput = textDecoder.decode(input);
    return AdbConnectionInformation.fromString(decodedInput);
  }

  /**
   * Creates an AdbConnectionInformation from a Connection string
   * @param input the string sent as data from a Connection response
   */
  static fromString(input: string): AdbConnectionInformation {
    const start = input.indexOf('::');
    const properties = input.substring(start + 2).split(';');
    let productName = DEFAULT_PRODUCT_VALUE;
    let productDevice = DEFAULT_PRODUCT_VALUE;
    let productModel = DEFAULT_PRODUCT_VALUE;
    let features: string[] = [];
    for (const property of properties) {
      if (property.startsWith(PRODUCT_NAME_KEY)) {
        productName = property.substring(PRODUCT_NAME_KEY.length + 1);
        continue;
      }

      if (property.startsWith(PRODUCT_MODEL_KEY)) {
        productModel = property.substring(PRODUCT_MODEL_KEY.length + 1);
        continue;
      }

      if (property.startsWith(PRODUCT_DEVICE_KEY)) {
        productDevice = property.substring(PRODUCT_DEVICE_KEY.length + 1);
        continue;
      }

      if (property.startsWith(FEATURES_KEY)) {
        features = property.substring(FEATURES_KEY.length + 1).split(',');
      }
    }
    return new AdbConnectionInformation(productName, productDevice, productModel, features);
  }
}
