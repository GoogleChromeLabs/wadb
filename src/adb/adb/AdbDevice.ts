import Device from '../Device';

export default class AdbDevice extends Device {
  send(data: string | ArrayBuffer | DataView): Promise<void> {
    throw new Error("Method not implemented.");
  }    
  
  receive(len: number): Promise<DataView> {
    throw new Error("Method not implemented.");
  }
}