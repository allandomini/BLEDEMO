// utils/FitProDecoder.ts
// Decodificador de mensagens do protocolo FitPro para dispositivos LT716

import { Buffer } from 'buffer';

// Mapeamento de comandos FitPro
const FITPRO_COMMANDS: Record<number, {
  name: string;
  commands: Record<number, string>;
}> = {
  0x12: {
    name: 'General',
    commands: {
      0x01: 'Set Date/Time',
      0x03: 'Set Step Goal',
      0x0B: 'Find Band',
      0x11: 'Notification Call',
      0x12: 'Notification Message',
      0x15: 'Set Language',
    }
  },
  0x15: {
    name: 'Sports Data',
    commands: {
      0x02: 'Step Data',
      0x06: 'Day Steps Summary',
      0x0E: 'Heart Rate Data',
    }
  },
  0x1A: {
    name: 'Request Data',
    commands: {
      0x10: 'Get HW Info'
    }
  },
  0x1C: {
    name: 'Button Actions',
    commands: {
      0x01: 'Find Phone',
      0x0B: 'Media Play/Pause',
    }
  },
  0x20: {
    name: 'Band Info',
    commands: {
      0x23: 'Get Band Name'
    }
  }
};

export function decodeFitProMessage(rawBytes: number[]): string {
  if (!rawBytes || rawBytes.length < 5) {
    return "Invalid message (too short)";
  }
  
  const header = rawBytes[0];
  
  // ACK Message (0xDC)
  if (header === 0xDC) {
    let decoded = "✅ ACK: ";
    
    if (rawBytes.length >= 5) {
      const cmdGroup = rawBytes[3];
      const command = rawBytes[4];
      
      const groupInfo = FITPRO_COMMANDS[cmdGroup];
      const cmdName = groupInfo?.commands[command] || `Unknown(0x${command.toString(16)})`;
      
      decoded += cmdName;
      
      // Special ACK meanings
      if (cmdGroup === 0x12 && command === 0x0B) {
        decoded += " (Device is vibrating!)";
      } else if (cmdGroup === 0x12 && command === 0x12) {
        decoded += " (Message displayed!)";
      }
    }
    
    return decoded;
  }
  
  // Data Packet (0xCD)
  if (header === 0xCD) {
    let decoded = "📦 Data: ";
    
    if (rawBytes.length >= 8) {
      const cmdGroup = rawBytes[3];
      const command = rawBytes[5];
      const payloadLen = (rawBytes[6] << 8) | rawBytes[7];
      
      const groupInfo = FITPRO_COMMANDS[cmdGroup];
      const cmdName = groupInfo?.commands[command] || `Unknown(0x${command.toString(16)})`;
      
      decoded += cmdName;
      
      // Decode specific payloads
      if (payloadLen > 0 && rawBytes.length >= 8 + payloadLen) {
        const payload = rawBytes.slice(8, 8 + payloadLen);
        
        if (cmdGroup === 0x1A && command === 0x10) {
          // HW Info
          const info = decodeHardwareInfo(payload);
          if (info) decoded += ` - ${info}`;
        } else if (cmdGroup === 0x15 && command === 0x02) {
          // Steps
          const steps = decodeStepsData(payload);
          if (steps !== null) decoded += ` - ${steps} steps`;
        }
      }
    }
    
    return decoded;
  }
  
  // Unknown message
  return `Unknown (0x${header.toString(16)}): [${rawBytes.slice(0, 10).join(', ')}${rawBytes.length > 10 ? '...' : ''}]`;
}

function decodeHardwareInfo(payload: number[]): string | null {
  try {
    let result = [];
    let offset = 0;
    
    // Usually contains 2 strings
    while (offset < payload.length) {
      const len = payload[offset++];
      if (offset + len <= payload.length) {
        const str = Buffer.from(payload.slice(offset, offset + len)).toString('utf8');
        result.push(str);
        offset += len;
      } else {
        break;
      }
    }
    
    return result.join(' / ');
  } catch (e) {
    return null;
  }
}

function decodeStepsData(payload: number[]): number | null {
  if (payload.length >= 4) {
    return (payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3];
  }
  return null;
}