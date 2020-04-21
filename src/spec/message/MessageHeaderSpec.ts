import {MessageHeader} from '../../lib/message';

describe('Message', () => {
  describe('#parse', () => {
    it('parses a messsage header', () => {
      const data = new DataView(new ArrayBuffer(24));
      data.setUint32(0, 0x4e584e43, true); // CNXN
      data.setUint32(4, 0x01000000, true); // Version
      data.setUint32(8, 256 * 1024, true); // Length
      data.setUint32(12, 16, true); // Length
      data.setUint32(16, 0, true); // Checksum
      data.setUint32(20, 0x4e584e43 ^ 0xffffffff, true); // Magic

      const header = MessageHeader.parse(data);
      expect(header.cmd).toBe('CNXN');
      expect(header.arg0).toBe(0x01000000);
      expect(header.arg1).toBe(256 * 1024);
      expect(header.length).toBe(16);
      expect(header.checksum).toBe(0);
    });
  });

  describe('#toDataView', () => {
    it ('converts a header to a DataView', () => {
      const data = new MessageHeader('CNXN', 0x01000000, 256 * 1024, 16, 0).toDataView();
      expect(data.getUint32(0, true)).toBe(0x4e584e43);
      expect(data.getUint32(4, true)).toBe(0x01000000);
      expect(data.getUint32(8, true)).toBe(256 * 1024);
      expect(data.getUint32(12, true)).toBe(16);
      expect(data.getUint32(16, true)).toBe(0);
      expect(data.getInt32(20, true)).toBe((0x4e584e43 ^ 0xffffffff));
    });
  });
});
