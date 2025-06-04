// utils/FitProConstants.ts
// Constantes e utilitários para o protocolo FitPro

export const FitProConstants = {
    // Headers
    DATA_HEADER: 0xCD,
    DATA_HEADER_ACK: 0xDC,
    
    // Command Groups
    CMD_GROUP_GENERAL: 0x12,
    CMD_GROUP_SPORTS_DATA: 0x15,
    CMD_GROUP_REQUEST_DATA: 0x1A,
    CMD_GROUP_BUTTON_DATA: 0x1C,
    CMD_GROUP_BAND_INFO: 0x20,
    
    // General Commands (0x12)
    CMD_SET_DATE_TIME: 0x01,
    CMD_SET_USER_INFO: 0x09,
    CMD_FIND_BAND: 0x0B,
    CMD_NOTIFICATION_CALL: 0x11,
    CMD_NOTIFICATION_MESSAGE: 0x12,
    CMD_SET_LANGUAGE: 0x15,
    
    // Request Data Commands (0x1A)
    CMD_GET_HW_INFO: 0x10,
    
    // Band Info Commands (0x20)
    CMD_GET_BAND_NAME: 0x23,
    
    // Values
    VALUE_ON: 0x01,
    VALUE_OFF: 0x00,
  };
  
  // Packet structure indices
  export const PKT_IDX = {
    HEADER: 0,
    FULL_LEN_HI: 1,
    FULL_LEN_LO: 2,
    CMD_GROUP: 3,
    DELIMITER: 4,
    COMMAND: 5,
    PAYLOAD_LEN_HI: 6,
    PAYLOAD_LEN_LO: 7,
    PAYLOAD_START: 8,
  };
  
  /**
   * Build a FitPro protocol command packet
   * @param commandGroup Command group byte
   * @param command Specific command byte
   * @param payload Optional payload array
   * @returns Complete packet as byte array
   */
  export function buildFitProCommand(
    commandGroup: number,
    command: number,
    payload: number[] = []
  ): number[] {
    const packet = new Array(PKT_IDX.PAYLOAD_START + payload.length).fill(0);
    
    // Header
    packet[PKT_IDX.HEADER] = FitProConstants.DATA_HEADER;
    
    // Command structure
    packet[PKT_IDX.CMD_GROUP] = commandGroup;
    packet[PKT_IDX.DELIMITER] = 0x01;
    packet[PKT_IDX.COMMAND] = command;
    
    // Payload length
    const payloadLength = payload.length;
    packet[PKT_IDX.PAYLOAD_LEN_HI] = (payloadLength >> 8) & 0xFF;
    packet[PKT_IDX.PAYLOAD_LEN_LO] = payloadLength & 0xFF;
    
    // Full packet length (from CMD_GROUP to end)
    const fullLength = 5 + payloadLength; // CG(1) + D(1) + C(1) + PLH(1) + PLL(1) + payload
    packet[PKT_IDX.FULL_LEN_HI] = (fullLength >> 8) & 0xFF;
    packet[PKT_IDX.FULL_LEN_LO] = fullLength & 0xFF;
    
    // Copy payload
    if (payloadLength > 0) {
      for (let i = 0; i < payloadLength; i++) {
        packet[PKT_IDX.PAYLOAD_START + i] = payload[i];
      }
    }
    
    return packet;
  }