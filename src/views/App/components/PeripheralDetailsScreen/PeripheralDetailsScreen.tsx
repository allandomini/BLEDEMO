import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Button, NativeEventEmitter, NativeModules, Modal, TouchableOpacity, Dimensions, Platform, Animated, Easing } from 'react-native';
// Using a simple text icon for now, you can replace with an SVG or image library
// import { BarChartIcon } from './your-icon-library'; // Example if you have one
import { Buffer } from 'buffer';
import BleManager, {
  BleManagerDidUpdateValueForCharacteristicEvent,
  PeripheralInfo,
  Characteristic
} from 'react-native-ble-manager';

// Extend the Characteristic type to include isNotifying
declare module 'react-native-ble-manager' {
  interface Characteristic {
    isNotifying?: boolean;
  }
}
import { LineChart } from 'react-native-gifted-charts';
import HeatmapChart from '../HeatmapChart/HeatmapChart';
// No topo do PeripheralDetailsScreen.tsx
import { FitProConstants, buildFitProCommand, PKT_IDX } from './utils/FitProConstants'; // Ajuste o caminho
import { decodeFitProMessage } from './utils/FitProDecoder';

// Create the BLE manager emitter at the module level
const bleManagerEmitter = NativeModules.BleManager
  ? new NativeEventEmitter(NativeModules.BleManager)
  : null;
// Define interfaces for your peripheral's properties
// Standard BLE UUIDs
const DEVICE_INFO_SERVICE = '180A';
const BATTERY_SERVICE = '180F';
const BATTERY_LEVEL_CHAR = '2A19';

// Common UUIDs for device information
const MANUFACTURER_NAME_CHAR = '2A29';
const MODEL_NUMBER_CHAR = '2A24';
const SERIAL_NUMBER_CHAR = '2A25';
const HARDWARE_REVISION_CHAR = '2A27';
const FIRMWARE_REVISION_CHAR = '2A26';
const SOFTWARE_REVISION_CHAR = '2A28';

// LT716 UART Service and Characteristics (NUS - Nordic UART Service)
const LT716_NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9d';
const LT716_NUS_CHAR_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9d'; // App writes here
const LT716_NUS_CHAR_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9d'; // App receives notifications here

// Props expected by PeripheralDetails component
interface PeripheralDetailsProps {
  route: {
    params: {
      peripheralData: PeripheralInfo;
    };
  };
}

// Types for FITPRO_COMMANDS
type CommandGroup = {
  name: string;
  commands: Record<number, string>;
};

type FitProCommands = Record<number, CommandGroup>;

// Battery Icon Component
const BatteryIcon = ({ level = 'N/A' }) => {
  // Default to 100% if level is not a number
  let batteryLevel = typeof level === 'number' ? level : 100;
  let batteryColor = '#34C759'; // Green

  if (batteryLevel <= 20) batteryColor = '#FF3B30'; // Red
  else if (batteryLevel <= 50) batteryColor = '#FFCC00'; // Yellow

  const fillWidth = Math.min(20, Math.max(2, (20 * batteryLevel) / 100));
  const FITPRO_COMMANDS: FitProCommands = {
    // Grupo 0x12 - Comandos Gerais
    0x12: {
      name: 'General',
      commands: {
        0x01: 'Set Date/Time',
        0x02: 'Set Alarm',
        0x03: 'Set Step Goal',
        0x04: 'Set User Data',
        0x05: 'Set Long Sit Reminder',
        0x06: 'Set Arm',
        0x07: 'Enable Notifications',
        0x08: 'Set Device Vibrations',
        0x09: 'Set Display on Lift',
        0x0A: 'Init1',
        0x0B: 'Find Band',
        0x0C: 'Camera',
        0x0D: 'Get Heart Rate',
        0x0E: 'Get Blood Pressure',
        0x0F: 'Set Sleep Times',
        0x11: 'Notification Call',
        0x12: 'Notification Message',
        0x14: 'Do Not Disturb',
        0x15: 'Set Language',
        0x18: 'Heart Rate Measurement',
        0x20: 'Weather',
        0x21: 'Set Temperature Unit',
        0xFF: 'Init3'
      }
    },
    // Grupo 0x15 - Dados Esportivos
    0x15: {
      name: 'Sports Data',
      commands: {
        0x01: 'Sports Key',
        0x02: 'Step Data',
        0x03: 'Sleep Data',
        0x06: 'Day Steps Summary',
        0x07: 'Steps Data Type 7',
        0x08: 'Steps Data Type 8',
        0x0C: 'Sports Day Data',
        0x0D: 'Fetch Day Steps',
        0x0E: 'Heart Rate Data',
        0x10: 'Steps Data Type 16',
        0x18: 'Sports Measurement'
      }
    },
    // Grupo 0x16 - Configurações de Batimentos
    0x16: {
      name: 'Heart Rate Settings',
      commands: {}
    },
    // Grupo 0x1A - Requisição de Dados
    0x1A: {
      name: 'Request Data',
      commands: {
        0x01: 'Unknown Request 1',
        0x02: 'Get Steps Target',
        0x08: 'Get Auto HR',
        0x0A: 'Unknown Request A',
        0x0C: 'Unknown Request C',
        0x0D: 'Get Contacts',
        0x0F: 'Unknown Request F',
        0x10: 'Get HW Info'
      }
    },
    // Grupo 0x1C - Dados de Botões
    0x1C: {
      name: 'Button Data',
      commands: {
        0x01: 'Find Phone',
        0x02: 'Camera Button 1',
        0x03: 'Camera Button 2',
        0x04: 'Camera Button 3',
        0x0A: 'Media Back',
        0x0B: 'Media Play/Pause',
        0x0C: 'Media Forward'
      }
    },
    // Grupo 0x1D - Reset
    0x1D: {
      name: 'Reset',
      commands: {
        0x01: 'Reset Device'
      }
    },
    // Grupo 0x20 - Informações da Banda
    0x20: {
      name: 'Band Info',
      commands: {
        0x02: 'Band Info',
        0x23: 'Get Band Name'
      }
    }
  };

// Função principal de decodificação
const decodeFitProMessage = (rawBytes: number[]): string => {
  if (!rawBytes || rawBytes.length < 5) {
    return "❌ Mensagem muito curta para decodificar";
  }

  const header = rawBytes[0];
  let decoded = "";

  // Se for ACK (0xDC)
  if (header === 0xDC) {
    decoded += "📥 **ACK Recebido**\n";

    if (rawBytes.length >= 5) {
      const cmdGroup = rawBytes[3];
      const command = rawBytes[4];

      const groupInfo = FITPRO_COMMANDS[cmdGroup];
      const cmdName = groupInfo?.commands[command] || `Unknown (0x${command.toString(16)})`;
      const groupName = groupInfo?.name || `Unknown Group (0x${cmdGroup.toString(16)})`;

      decoded += `    ✅ Confirmação de: ${cmdName}\n`;
      decoded += `    📁 Grupo: ${groupName}\n`;

      // ACKs especiais com significado
      if (cmdGroup === 0x12) {
        switch (command) {
          case 0x0B:
            decoded += "    💫 **O relógio está vibrando!**\n";
            break;
          case 0x12:
            decoded += "    💬 **Notificação exibida no display!**\n";
            break;
          case 0x11:
            decoded += "    📞 **Chamada exibida no display!**\n";
            break;
          case 0x01:
            decoded += "    ⏰ **Data/Hora configurada!**\n";
            break;
        }
      }
    }

    // Detalhes técnicos
    decoded += `\n📊 Detalhes: [${rawBytes.join(', ')}]`;

  }
  // Se for pacote de dados (0xCD)
  else if (header === 0xCD) {
    decoded += "📦 **Pacote de Dados**\n";

    if (rawBytes.length >= 8) {
      const cmdGroup = rawBytes[3];
      const command = rawBytes[5];
      const payloadLen = (rawBytes[6] << 8) | rawBytes[7];

      const groupInfo = FITPRO_COMMANDS[cmdGroup];
      const cmdName = groupInfo?.commands[command] || `Unknown (0x${command.toString(16)})`;
      const groupName = groupInfo?.name || `Unknown Group (0x${cmdGroup.toString(16)})`;

      decoded += `    📋 Comando: ${cmdName}\n`;
      decoded += `    📁 Grupo: ${groupName}\n`;
      decoded += `    📏 Tamanho do payload: ${payloadLen} bytes\n`;

      // Decodificar payload específico
      if (payloadLen > 0 && rawBytes.length >= 8 + payloadLen) {
        const payload = rawBytes.slice(8, 8 + payloadLen);

        // Decodificação específica por comando
        if (cmdGroup === 0x1A && command === 0x10) {
          // HW Info
          decoded += "\n🔧 **Informações de Hardware:**\n";
          decoded += decodeHardwareInfo(payload);
        }
        else if (cmdGroup === 0x15 && command === 0x02) {
          // Dados de Passos
          decoded += "\n🚶 **Dados de Passos:**\n";
          decoded += decodeStepsData(payload);
        }
        else if (cmdGroup === 0x15 && command === 0x0E) {
          // Dados de Batimentos
          decoded += "\n❤️ **Dados de Batimentos:**\n";
          decoded += decodeHeartRateData(payload);
        }
        else if (cmdGroup === 0x1C) {
          // Botão pressionado no relógio
          decoded += "\n🔘 **Ação do Usuário no Relógio:**\n";
          switch (command) {
            case 0x01:
              decoded += "    📱 Usuário ativou 'Encontrar Telefone'!\n";
              break;
            case 0x02:
            case 0x03:
            case 0x04:
              decoded += "    📸 Usuário ativou controle de câmera!\n";
              break;
            case 0x0B:
              decoded += "    ⏯️ Usuário pressionou Play/Pause!\n";
              break;
            case 0x0C:
              decoded += "    ⏭️ Usuário pressionou Próxima!\n";
              break;
            case 0x0A:
              decoded += "    ⏮️ Usuário pressionou Anterior!\n";
              break;
          }
        }
        else {
          // Payload genérico
          decoded += `\n📝 Payload (hex): ${Buffer.from(payload).toString('hex')}`;
        }
      }
    }

    decoded += `\n📊 Raw: [${rawBytes.join(', ')}]`;
  }
  // Mensagem desconhecida
  else {
    decoded += `❓ Tipo desconhecido (Header: 0x${header.toString(16)})\n`;
    decoded += `📊 Bytes: [${rawBytes.join(', ')}]\n`;

    // Tenta decodificar como texto
    try {
      const text = Buffer.from(rawBytes).toString('utf8');
      if (text && isPrintableText(text)) {
        decoded += `📝 Como texto: "${text}"`;
      }
    } catch (e) {
      // Não é texto
    }
  }

  return decoded;
};

// Funções auxiliares de decodificação
const decodeHardwareInfo = (payload: number[]): string => {
  let result = "";
  let offset = 0;

  // HW Info geralmente tem 2 strings
  if (offset < payload.length) {
    const len1 = payload[offset++];
    if (offset + len1 <= payload.length) {
      const str1 = Buffer.from(payload.slice(offset, offset + len1)).toString('utf8');
      result += `    Modelo: ${str1}\n`;
      offset += len1;
    }
  }

  if (offset < payload.length) {
    const len2 = payload[offset++];
    if (offset + len2 <= payload.length) {
      const str2 = Buffer.from(payload.slice(offset, offset + len2)).toString('utf8');
      result += `    Versão: ${str2}\n`;
    }
  }

  return result || "    (Não foi possível decodificar)\n";
};

const decodeStepsData = (payload: number[]): string => {
  if (payload.length >= 4) {
    const steps = (payload[0] << 24) | (payload[1] << 16) |
            (payload[2] << 8) | payload[3];
    return `    Total de passos: ${steps.toLocaleString()}\n`;
  }
  return "    (Dados insuficientes)\n";
};

const decodeHeartRateData = (payload: number[]): string => {
  if (payload.length >= 2) {
    const hr = payload[1]; // Geralmente no byte 1
    return `    Batimentos: ${hr} bpm\n`;
  }
  return "    (Dados insuficientes)\n";
};

// Componente visual para mostrar mensagens decodificadas
const FitProMessageDecoder = ({ message }: { message: number[] }) => {
  const decoded = decodeFitProMessage(message);

  return (
    <View style={styles.decodedMessageBox}>
      <Text style={styles.decodedMessageText}>{decoded}</Text>
    </View>
  );
};
  return (
    <View style={styles.batteryContainer}>
      <View style={styles.batteryOutline}>
        <Animated.View
          style={[
            styles.batteryFill,
            {
              width: fillWidth,
              backgroundColor: batteryColor,
            }
          ]}
        />
      </View>
      <View style={styles.batteryTip} />

    </View>
  );
};

const PeripheralDetailsScreen = ({ route }: PeripheralDetailsProps) => {
  const { peripheralData } = route.params;
  const peripheralId = peripheralData.id;

  const [deviceInfo, setDeviceInfo] = useState({
    manufacturer: 'N/A',
    model: 'N/A',
    serialNumber: 'N/A',
    hardwareRevision: 'N/A',
    firmwareRevision: 'N/A',
    softwareRevision: 'N/A',
    batteryLevel: 'N/A',
  });
  const [readData, setReadData] = useState<string>(''); // For general read operations and write confirmations
  const [notificationLog, setNotificationLog] = useState<string>(''); // For characteristic notifications
  const [textToWrite, setTextToWrite] = useState<string>(''); // Text to write to characteristic
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // RSSI monitoring states
  const [rssiModalVisible, setRssiModalVisible] = useState(false);
  const [currentRSSI, setCurrentRSSI] = useState<number | null>(peripheralData.rssi || null);
  const [rssiHistory, setRssiHistory] = useState<{ value: number, label?: string, labelTextStyle?: object }[]>([]);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.9))[0];
  const MAX_RSSI_HISTORY = 30;
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth * 0.85; // Adjusted for modal
  const RSSI_POLL_INTERVAL = 2000;

  // Device type detection
  const isJBL = peripheralData.name?.includes('JBL') || false;
    
  // *** LÓGICA DE IDENTIFICAÇÃO CORRIGIDA E SIMPLIFICADA ***
  // É um dispositivo NUS se tiver o serviço Nordic UART, não importa o nome.
  const isNusDevice = !!peripheralData.services?.find(s => s.uuid.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase());


  const [serviceToWrite, setServiceToWrite] = useState<string>(''); // Service UUID for writing
  const [charToWrite, setCharToWrite] = useState<string>(''); // Characteristic UUID for writing
  // No need for service/characteristic notification states if we derive them or use constants

  const scrollViewRef = useRef<ScrollView>(null);
  const notificationsScrollViewRef = useRef<ScrollView>(null);


  // Effect for device-specific UUID setup (primarily for writing)
  useEffect(() => {
    if (!peripheralId) return;
    setIsLoading(false); // Moved here, as basic info is already available

    // Simplificado: se for um dispositivo NUS, configura para escrita.
    if (isNusDevice) {
      setServiceToWrite(LT716_NUS_SERVICE_UUID);
      setCharToWrite(LT716_NUS_CHAR_RX_UUID);
    }

    return () => {
      setServiceToWrite('');
      setCharToWrite('');
    };
  }, [peripheralId, isNusDevice]);

  // Ensure notifications are started after connection
  const ensureNotificationsStarted = useCallback(async () => {
    if (!peripheralId || !isNusDevice) return;

    console.log('🔔 Garantindo que notificações estejam ativas...');

    // Aguardar um pouco após conexão
    await new Promise<void>(resolve => setTimeout(resolve, 1000));

    try {
      // Verificar se já está notificando
      const services = await BleManager.retrieveServices(peripheralId);
      const txChar = services.characteristics?.find(c =>
        c.characteristic.toUpperCase() === LT716_NUS_CHAR_TX_UUID.toUpperCase()
      );

      if (txChar && !txChar.isNotifying) {
        console.log('⚠️ Notificações não estão ativas, iniciando...');
        await BleManager.startNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID);
        console.log('✅ Notificações iniciadas com sucesso!');
      } else if (txChar?.isNotifying) {
        console.log('✅ Notificações já estão ativas');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar/iniciar notificações:', error);
    }
  }, [peripheralId, isNusDevice]);

  // Call ensureNotificationsStarted after component mounts and when peripheralId or isNusDevice changes
  useEffect(() => {
    if (peripheralId && isNusDevice) {
      ensureNotificationsStarted();
    }
  }, [peripheralId, isNusDevice, ensureNotificationsStarted]);

  // Function to restart notifications
  const restartNotifications = async () => {
    if (!peripheralId || !isNusDevice) return;

    try {
      console.log('Restarting notifications...');

      // Stop existing notifications
      try {
        await BleManager.stopNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID);
      } catch (e) {
        console.log('No existing notification to stop');
      }

      // Wait a bit
      await new Promise<void>(resolve => setTimeout(resolve, 500));

      // Restart notifications
      try {
        await BleManager.startNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID);
        console.log('✅ LT716 NUS TX notifications started');
        console.log('✅ Notifications restarted successfully');

        setNotificationLog(prev =>
          `🔄 [${new Date().toLocaleTimeString()}] Notifications restarted\n${prev}`
        );
      } catch (error) {
        console.error('❌ Failed to start LT716 NUS TX notifications:', error);
        throw error; // Re-throw to be caught by the outer try-catch
      }

    } catch (error) {
      console.error('Failed to restart notifications:', error);
      setNotificationLog(prev =>
        `❌ [${new Date().toLocaleTimeString()}] Failed to restart notifications\n${prev}`
      );
    }
  };

  // Function to read general device information
  const readDeviceInfo = async () => {
    if (!peripheralId) return;
    setIsLoading(true);
    // Fetching device info...

    const readCharacteristic = async (service: string, char: string, name: string) => {
      try {
        const dataBytes = await BleManager.read(peripheralId, service, char);
        const value = Buffer.from(dataBytes).toString('utf8');
        // Log device info
        return value;
      } catch (error) {
        // Error reading device info
        return 'N/A';
      }
    };

    try {
      const [
        manufacturer,
        model,
        serialNumber,
        hardwareRevision,
        firmwareRevision,
        softwareRevision,
        batteryData // Read battery as part of this refresh
      ] = await Promise.all([
        readCharacteristic(DEVICE_INFO_SERVICE, MANUFACTURER_NAME_CHAR, 'Manufacturer'),
        readCharacteristic(DEVICE_INFO_SERVICE, MODEL_NUMBER_CHAR, 'Model'),
        readCharacteristic(DEVICE_INFO_SERVICE, SERIAL_NUMBER_CHAR, 'Serial Number'),
        readCharacteristic(DEVICE_INFO_SERVICE, HARDWARE_REVISION_CHAR, 'Hardware Revision'),
        readCharacteristic(DEVICE_INFO_SERVICE, FIRMWARE_REVISION_CHAR, 'Firmware Revision'),
        readCharacteristic(DEVICE_INFO_SERVICE, SOFTWARE_REVISION_CHAR, 'Software Revision'),
        BleManager.read(peripheralId, BATTERY_SERVICE, BATTERY_LEVEL_CHAR).catch(() => [0]) // Read battery, default to 0 on error
      ]);

      const batteryLevel = batteryData[0];
      // Battery level read successfully

      setDeviceInfo({
        manufacturer,
        model,
        serialNumber,
        hardwareRevision,
        firmwareRevision,
        softwareRevision,
        batteryLevel: `${batteryLevel}%`,
      });
    } catch (error) {
      // Error reading device information
      // Keep existing N/A values or set them explicitly
      setDeviceInfo(prev => ({
        ...prev, // Keep whatever might have been partially fetched or default
        manufacturer: prev.manufacturer !== 'N/A' ? prev.manufacturer : 'N/A',
        model: prev.model !== 'N/A' ? prev.model : 'N/A',
        // ... and so on for other fields if a global catch happens
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch and logging
  useEffect(() => {
    readDeviceInfo(); // Fetch device info on mount

    // Initialize component and check BLE manager availability
    const BleManagerModuleInstance = NativeModules.BleManager;
    if (!BleManagerModuleInstance) {
     // console.error('CRITICAL: BleManager module not available');
    }
  }, [peripheralId, peripheralData]); // Dependências importantes


  // RSSI Polling Effect
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const fetchRSSI = async () => {
      if (peripheralId) {
        try {
          const rssiValue = await BleManager.readRSSI(peripheralId);
          setCurrentRSSI(rssiValue);
          setRssiHistory(prevHistory => {
            const now = new Date();
            const timeLabel = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            const newPoint = {
              value: rssiValue,
              label: prevHistory.length % 5 === 0 ? timeLabel : undefined, // Label every 5 points
              labelTextStyle: { color: 'gray', fontSize: 10, textAlign: 'center', width: 40 }
            };
            const newHistory = [...prevHistory, newPoint];
            return newHistory.length > MAX_RSSI_HISTORY ? newHistory.slice(-MAX_RSSI_HISTORY) : newHistory;
          });
        } catch (err) {
          // Failed to read RSSI
          if (intervalId && !rssiModalVisible) clearInterval(intervalId); // Stop if modal closed and error
        }
      }
    };

    if (rssiModalVisible && peripheralId) {
      setRssiHistory([]);
      setCurrentRSSI(null);
      // Animate modal in
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
      fetchRSSI();
      intervalId = setInterval(fetchRSSI, RSSI_POLL_INTERVAL);
    } else if (intervalId) {
      // Animate modal out
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
      clearInterval(intervalId);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [peripheralId, rssiModalVisible]);
  const initializeLT716Device = async () => {
    console.log('🚀 Starting LT716 initialization sequence...');

    try {
      // 1. Set current date/time
      const now = new Date();
      const dateTimePayload = [
        now.getFullYear() - 2000,  // Year (2-digit)
        now.getMonth() + 1,        // Month (1-12)
        now.getDate(),             // Day
        now.getHours(),            // Hour
        now.getMinutes(),          // Minute
        now.getSeconds()           // Second
      ];

      await writeBytesToDevice(
        buildFitProCommand(
          FitProConstants.CMD_GROUP_GENERAL,
          FitProConstants.CMD_SET_DATE_TIME,
          dateTimePayload
        ),
        "Set Date/Time"
      );

      await new Promise<void>(resolve => setTimeout(resolve, 300));

      // 2. Set user info (example values)
      const userInfoPayload = [
        0x01,    // Gender (1=male, 2=female)
        25,      // Age
        175,     // Height in cm
        70,      // Weight in kg
        10000 >> 8, 10000 & 0xFF  // Step goal (10000 steps)
      ];

      await writeBytesToDevice(
        buildFitProCommand(
          FitProConstants.CMD_GROUP_GENERAL,
          FitProConstants.CMD_SET_USER_INFO,
          userInfoPayload
        ),
        "Set User Info"
      );

      await new Promise<void>(resolve => setTimeout(resolve, 300));

      // 3. Set language (0x01 = English)
      await writeBytesToDevice(
        buildFitProCommand(
          FitProConstants.CMD_GROUP_GENERAL,
          FitProConstants.CMD_SET_LANGUAGE,
          [0x01]
        ),
        "Set Language"
      );

      await new Promise<void>(resolve => setTimeout(resolve, 300));

      // 4. Now try to get HW info
      console.log('📱 Initialization complete, requesting HW info...');
      await sendGetHwInfoFitPro();

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      setNotificationLog(prev =>
        `❌ [${new Date().toLocaleTimeString()}] Init failed: ${error}\n${prev}`
      );
    }
  };
  const sendTextAsNotification = async (text: string, icon: number = 0x01) => {
    try {
      // Converte o texto para bytes UTF-8
      const textBytes = Array.from(Buffer.from(text, 'utf8'));

      // Limite de 20 bytes por pacote BLE, menos o overhead do protocolo
      const maxTextLength = 12; // Ajuste conforme necessário
      const truncatedBytes = textBytes.slice(0, maxTextLength);

      // Monta o payload da notificação
      const payload = [
        icon, // Ícone da notificação (0x01 = SMS)
        ...truncatedBytes
      ];

      // Envia como comando de notificação
      const commandBytes = buildFitProCommand(
        FitProConstants.CMD_GROUP_GENERAL,
        FitProConstants.CMD_NOTIFICATION_MESSAGE,
        payload
      );

      console.log('📱 Enviando texto como notificação:', text);
      await writeBytesToDevice(commandBytes, `Notification: "${text}"`);

      // O dispositivo deve vibrar e mostrar o texto
      setReadData(prev =>
        `📱 Texto enviado como notificação: "${text}"\n${prev}`.slice(0, 1000)
      );

    } catch (error) {
      console.error('Erro ao enviar texto:', error);
      setReadData(prev =>
        `❌ Erro ao enviar texto: ${error}\n${prev}`.slice(0, 1000)
      );
    }
  };
  const interpretResponseAsText = (rawBytes: number[]): string | null => {

    // Tenta extrair texto de payloads conhecidos
    if (!rawBytes || rawBytes.length < PKT_IDX.PAYLOAD_START) {
      return null;
    }

    const header = rawBytes[PKT_IDX.HEADER];

    // Se for um pacote de dados (não ACK)
    if (header === FitProConstants.DATA_HEADER) {
      const payloadLen = (rawBytes[PKT_IDX.PAYLOAD_LEN_HI] << 8) |
                           rawBytes[PKT_IDX.PAYLOAD_LEN_LO];

      if (payloadLen > 0 && rawBytes.length >= PKT_IDX.PAYLOAD_START + payloadLen) {
        const payload = rawBytes.slice(PKT_IDX.PAYLOAD_START,
                                      PKT_IDX.PAYLOAD_START + payloadLen);

        // Tenta decodificar como UTF-8
        try {
          const text = Buffer.from(payload).toString('utf8').trim();
          if (text && text.length > 0 && isPrintableText(text)) {
            return text;
          }
        } catch (e) {
          // Não é texto válido
        }
      }
    }

    return null;
  };
  const isPrintableText = (str: string): boolean => {
    // Verifica se contém apenas caracteres imprimíveis
    return /^[\x20-\x7E\u00A0-\uFFFF]*$/.test(str);
  };

    // SOLUÇÃO: Usar useRef para evitar problemas de "stale state" no listener
    const isNusDeviceRef = useRef(isNusDevice);
    useEffect(() => {
        isNusDeviceRef.current = isNusDevice;
    }, [isNusDevice]);


  // Notification handling effect with timing test
  useEffect(() => {
    let isMounted = true;
    let notificationListener: ReturnType<NativeEventEmitter['addListener']> | null = null;

    if (!peripheralId || !bleManagerEmitter) {
      console.log("Skipping notification setup:", {
        peripheralId,
        emitter: !!bleManagerEmitter
      });
      return;
    }

    console.log("📡 Configurando listener de notificações...");

    const onCharacteristicChangedHandler = (event: BleManagerDidUpdateValueForCharacteristicEvent) => {
      const { peripheral, characteristic, service, value } = event;

      if (!isMounted || peripheral !== peripheralId) {
        return;
      }

      const timestamp = new Date().toLocaleTimeString();
      const rawBytesArray = Array.from(value);
      const hexValue = Buffer.from(rawBytesArray).toString('hex');
      let messageForLog = `[${timestamp}]`;

      // Se for notificação do serviço NUS (FitPro Watch ou Macbook)
      if (service?.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase() &&
          characteristic?.toUpperCase() === LT716_NUS_CHAR_TX_UUID.toUpperCase()) {

        const packetHeader = rawBytesArray.length > 0 ? rawBytesArray[0] : null;
        const isFitProPacket = packetHeader === FitProConstants.DATA_HEADER_ACK || packetHeader === FitProConstants.DATA_HEADER;

        if (isNusDeviceRef.current && isFitProPacket) {
            // Se for um dispositivo NUS E o pacote tiver um header FitPro, decodifica como FitPro.
            // Isso garante que estamos tratando dados do relógio.
            messageForLog += ` (FitPro): ${decodeFitProMessage(rawBytesArray)}`;
        } else {
            // Senão (se não for um pacote FitPro válido), trata como texto puro (do Macbook).
            const receivedText = Buffer.from(rawBytesArray).toString('utf8');
            messageForLog += ` 💻 From NUS Device: "${receivedText}"`;
        }
        setNotificationLog(prevLog => `${messageForLog}\n${prevLog}`.slice(0, 4000));

      } else if (service?.toUpperCase() === BATTERY_SERVICE.toUpperCase() &&
                 characteristic?.toUpperCase() === BATTERY_LEVEL_CHAR.toUpperCase()) {
        const batteryLevel = rawBytesArray[0];
        messageForLog += ` 🔋 Battery: ${batteryLevel}%`;
        setNotificationLog(prevLog => `${messageForLog}\n${prevLog}`.slice(0, 4000));
        setDeviceInfo(prev => ({ ...prev, batteryLevel: `${batteryLevel}%` }));
      } else {
        try {
            const decodedValue = Buffer.from(rawBytesArray).toString('utf8');
            messageForLog += ` 📥 S:${service?.slice(-4)} C:${characteristic?.slice(-4)} Data: "${decodedValue}" (hex: ${hexValue})`;
          } catch (e) {
            messageForLog += ` 📥 S:${service?.slice(-4)} C:${characteristic?.slice(-4)} Raw (bytes): ${rawBytesArray.join(', ')}`;
          }
          setNotificationLog(prevLog => `${messageForLog}\n${prevLog}`.slice(0, 4000));
      }
    };


    // Register the listener
    notificationListener = bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      onCharacteristicChangedHandler
    );

    console.log("✅ Listener registrado com sucesso!");

    // Função para iniciar notificações

const startDeviceNotifications = async () => {
  if (!isMounted || !peripheralId) {
    console.log("startDeviceNotifications: Componente não montado ou peripheralId ausente.");
    return;
  }

  // Verificação mais robusta para peripheralData e suas propriedades necessárias
  if (!peripheralData || !peripheralData.services || !peripheralData.characteristics) {
    console.warn('startDeviceNotifications: peripheralData ou seus campos services/characteristics estão indefinidos. Não é possível iniciar notificações.');
    // @ts-ignore
    setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ⚠️ ERRO: Dados do periférico (serv/char) incompletos para notif.\n${prev}`);
    return;
  }
  // A partir daqui, sabemos que peripheralData, .services, e .characteristics existem.
  // .characteristics pode ser um array vazio, o que é tratado pelo .find() retornando undefined.

  console.log('Verificando dados do periférico para notificações...');
  // console.log('Características disponíveis:', JSON.stringify(peripheralData.characteristics.map(c => ({svc: c.service.slice(-6), char: c.characteristic.slice(-6), props: c.properties})), null, 2));

  // Notificação de Bateria
  const batteryServiceInfo = peripheralData.services.find(s => s.uuid.toUpperCase() === BATTERY_SERVICE.toUpperCase());
  if (batteryServiceInfo) {
    // CORREÇÃO APLICADA AQUI com ?.
    const batteryCharInfo = peripheralData.characteristics?.find(c =>
      c.service.toUpperCase() === BATTERY_SERVICE.toUpperCase() &&
      c.characteristic.toUpperCase() === BATTERY_LEVEL_CHAR.toUpperCase() &&
      (c.properties.Notify || c.properties.Indicate)
    );
    if (batteryCharInfo) {
      try {
        console.log(`---> TENTANDO INICIAR NOTIFICAÇÕES para Bateria: ${peripheralId}`);
        await BleManager.startNotification(peripheralId, BATTERY_SERVICE, BATTERY_LEVEL_CHAR);
        console.log('✅ SUCESSO AO INICIAR NOTIFICAÇÕES de Bateria!');
        // @ts-ignore
        setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ✅ Notificações de Bateria INICIADAS.\n${prev}`);
      } catch (error) {
        console.error('❌ ERRO AO INICIAR notificações de Bateria:', error);
        // @ts-ignore
        setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ❌ ERRO notif. Bateria: ${String(error)}\n${prev}`);
      }
    } else {
      console.warn("Característica de Nível de Bateria não encontrada ou não notificável.");
    }
  }


  // Notificação NUS para LT716
  if (isNusDevice) {
    const nusServiceInfo = peripheralData.services.find(s => s.uuid.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase());
    if (nusServiceInfo) {
      // CORREÇÃO APLICADA AQUI com ?.
      const nusTxCharInfo = peripheralData.characteristics?.find(c =>
        c.service.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase() &&
        c.characteristic.toUpperCase() === LT716_NUS_CHAR_TX_UUID.toUpperCase() &&
        (c.properties.Notify || c.properties.Indicate)
      );
      if (nusTxCharInfo) {
        try {
          console.log(`---> TENTANDO INICIAR NOTIFICAÇÕES para NUS TX: ${peripheralId}`);
          await BleManager.startNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID);
          console.log('✅ SUCESSO AO INICIAR NOTIFICAÇÕES NUS TX!');
          // @ts-ignore
          setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ✅ Notificações NUS INICIADAS.\n${prev}`);
        } catch (error) {
          console.error('❌ ERRO AO INICIAR notificações NUS TX:', error);
          // @ts-ignore
          setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ❌ ERRO notif. NUS: ${String(error)}\n${prev}`);
        }
      } else {
        console.warn('Característica TX (`...dcca9d`) do NUS não encontrada ou não é notificável.');
        // @ts-ignore
        setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ⚠️ Alerta: Char TX NUS ('...dcca9d') não notificável/encontrada.\n${prev}`);
      }
    } else {
      console.warn('Serviço NUS (`...dcca9d`) não encontrado.');
      // @ts-ignore
      setNotificationLog(prev => `[${new Date().toLocaleTimeString()}] ⚠️ Alerta: Serviço NUS não encontrado.\n${prev}`);
    }
  }
};
    // Chama a ativação das notificações.
    // O setTimeout anterior foi removido; o ideal é que peripheralData já venha completo.
    // Se peripheralData.services/characteristics não estiverem prontos, a função startDeviceNotifications fará um 'return'.
    startDeviceNotifications();

    return () => {
      isMounted = false;
      if (notificationListener) {
        console.log("<--- Removendo listener BleManagerDidUpdateValueForCharacteristic");
        notificationListener.remove();
        console.log("🗑️ Listener BleManagerDidUpdateValueForCharacteristic REMOVIDO.");
      }
      // Considere parar as notificações ao desmontar a tela, se fizer sentido para o seu fluxo
      // Ex: BleManager.stopNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID).catch(e => console.log("Error stopping LT716 NUS TX notification on unmount", e));
      // Ex: BleManager.stopNotification(peripheralId, BATTERY_SERVICE, BATTERY_LEVEL_CHAR).catch(e => console.log("Error stopping Battery notification on unmount", e));
    };
  }, [peripheralId, peripheralData]); // Removido isLT716 e isMacbookBle das dependências
  const sendFindBandFitPro = async () => {
    const commandBytes = buildFitProCommand(
      FitProConstants.CMD_GROUP_GENERAL,
      FitProConstants.CMD_FIND_BAND,
      [FitProConstants.VALUE_ON] // [0x01]
    );
    await writeBytesToDevice(commandBytes, "Find Band");
  };


  const sendGetHwInfoFitPro = async () => {
    const commandBytes = buildFitProCommand(
      FitProConstants.CMD_GROUP_REQUEST_DATA,
      FitProConstants.CMD_GET_HW_INFO,
      []
    );
    await writeBytesToDevice(commandBytes, "Get HW Info");
  };

  const writeBytesToDevice = async (bytesToSend: number[], commandName: string = 'Command') => {
    if (!peripheralId || !serviceToWrite || !charToWrite) {
      // @ts-ignore
      setReadData(prev => `❌ Error: Device/Char not ready for ${commandName}.\n${prev}`.slice(0, 1000));
      return false;
    }
    if (!bytesToSend || bytesToSend.length === 0) {
      // @ts-ignore
      setReadData(prev => `⚠️ Error: No data to send for ${commandName}.\n${prev}`.slice(0, 1000));
      return false;
    }
    try {
      const hexToSend = Buffer.from(bytesToSend).toString('hex');
      // @ts-ignore
      setReadData(prev => `📤 Sending ${commandName}: ${hexToSend}...\n${prev}`.slice(0, 1000));
      console.log(`Sending ${commandName} bytes: [${bytesToSend.join(', ')}] (hex: ${hexToSend})`);
      console.log('To service:', serviceToWrite);
      console.log('To characteristic:', charToWrite);

      await BleManager.write(peripheralId, serviceToWrite, charToWrite, bytesToSend);

      const timestamp = new Date().toLocaleTimeString();
      // @ts-ignore
      setReadData(prev => `✅ [${timestamp}] Sent ${commandName}: ${hexToSend}\n${prev}`.slice(0, 1000));
      // @ts-ignore
      setNotificationLog(prev => `📤 [${timestamp}] SENT ${commandName} (hex: ${hexToSend})\n${prev}`.slice(0, 4000));
      console.log(`📨 ${commandName} ENVIADO! Aguardando resposta...`);
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Write error for ${commandName}:`, error);
      // @ts-ignore
      setReadData(prev => `❌ Write Error for ${commandName}: ${errMsg}\n${prev}`.slice(0, 1000));
      return false;
    }
  };

    const writeTextToDevice = async (text: string) => {
        if (!peripheralId || !serviceToWrite || !charToWrite) {
            setReadData(prev => `❌ Error: Device/Char not ready for writing text.\n${prev}`);
            return;
        }
        if (!text) {
            setReadData(prev => `⚠️ Error: Cannot send empty text.\n${prev}`);
            return;
        }

        try {
            const textBytes = Array.from(Buffer.from(text, 'utf8'));
            const commandName = `Text: "${text}"`;

            // Log para o usuário
            setReadData(prev => `📤 Sending ${commandName}...\n${prev}`.slice(0, 1000));
            console.log(`Sending ${commandName} as bytes: [${textBytes.join(', ')}]`);

            // **A CORREÇÃO PRINCIPAL ESTÁ AQUI**
            await BleManager.writeWithoutResponse(peripheralId, serviceToWrite, charToWrite, textBytes);

            const timestamp = new Date().toLocaleTimeString();
            setReadData(prev => `✅ [${timestamp}] Sent ${commandName}\n${prev}`.slice(0, 1000));
            console.log(`📨 ${commandName} SENT successfully!`);
            setTextToWrite(''); // Limpa o campo após o envio
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('Text write error:', error);
            setReadData(prev => `❌ Text Write Error: ${errMsg}\n${prev}`);
        }
    };


  // Render individual service item
  const renderServiceItem = (service: { uuid: string }, itemPeripheralData: PeripheralInfo) => {
    const characteristics = itemPeripheralData.characteristics?.filter(char => char.service === service.uuid) || [];
    return (
      <View key={service.uuid} style={styles.serviceCardItem}>
        <TouchableOpacity
            style={styles.serviceHeader}
            // onPress={() => console.log("Navigate to characteristics for", service.uuid)} // Placeholder for navigation
        >
          <Text style={styles.serviceUUID}>
            <Text style={styles.serviceIcon}>ⓘ </Text> {/* Simple text icon */}
            Service {service.uuid}
          </Text>
          <Text style={styles.serviceArrow}>{'>'}</Text>
        </TouchableOpacity>
        {/* Optionally, list characteristics here or navigate to a new screen */}
        {characteristics.length > 0 && (
          <View style={styles.characteristicsList}>
            {characteristics.map(char => (
              <View key={char.characteristic} style={styles.characteristicItem}>
                <Text style={styles.characteristicUUID}>UUID: {char.characteristic}</Text>
                <Text style={styles.characteristicProps}>
                  Properties: {Object.entries(char.properties).filter(([, value]) => value).map(([key]) => key).join(', ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };


  return (
    <ScrollView
      style={styles.screenContainer}
      ref={scrollViewRef}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {/* Device Header */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.deviceNameText}>{peripheralData.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceMacText}>{peripheralId}</Text>
        </View>
        <View style={styles.headerStatus}>
          <Text style={styles.statusConnectedText}>Connected</Text>
          <Text style={styles.rssiText}>{currentRSSI !== null ? `${currentRSSI} dBm` : 'RSSI N/A'}</Text>
        </View>
      </View>

      {/* General Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>General</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Manufacturer</Text>
          <Text style={styles.infoValue}>{deviceInfo.manufacturer}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Model Number</Text>
          <Text style={styles.infoValue}>{deviceInfo.model}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Serial Number</Text>
          <Text style={styles.infoValue}>{deviceInfo.serialNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Firmware Revision</Text>
          <Text style={styles.infoValue}>{deviceInfo.firmwareRevision}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hardware Revision</Text>
          <Text style={styles.infoValue}>{deviceInfo.hardwareRevision}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Software Revision</Text>
          <Text style={styles.infoValue}>{deviceInfo.softwareRevision}</Text>
        </View>
        <TouchableOpacity
            style={[styles.styledButton, styles.updateButton, {marginTop: 15}]}
            onPress={readDeviceInfo}
            disabled={isLoading}
        >
            <Text style={styles.styledButtonText}>{isLoading ? 'Loading...' : 'Refresh General Info'}</Text>
        </TouchableOpacity>
      </View>

      {/* Heatmap Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signal Strength Heatmap</Text>
        <HeatmapChart />
      </View>

      {/* Battery Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Battery</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Level</Text>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <BatteryIcon level={deviceInfo.batteryLevel.replace('%', '')} />
            <Text style={[styles.infoValue, styles.batteryLevelText, {marginLeft: 8}]}>
              {deviceInfo.batteryLevel}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.rssiButton} onPress={() => setRssiModalVisible(true)}>
          {/* Replace with a proper icon if available */}
          <Text style={styles.rssiButtonIcon}>📊</Text>
          <Text style={styles.rssiButtonText}>View RSSI Chart</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
  style={[styles.quickCommandButton, {backgroundColor: '#FF6B6B'}]}
  onPress={() => {
    // Envia um texto de teste
    sendTextAsNotification("Olá LT716!");
  }}
>
  <Text style={styles.quickCommandText}>Send Text</Text>
</TouchableOpacity>

      {/* Services Card - Simplified */}
       <View style={styles.card}>
        <Text style={styles.cardTitle}>Services & Characteristics</Text>
        {peripheralData.services && peripheralData.services.length > 0 ? (
            peripheralData.services.map(service => renderServiceItem(service, peripheralData))
        ) : (
            <Text style={styles.infoValue}>No services discovered or reported by peripheral.</Text>
        )}
      </View>
      <TouchableOpacity
  style={[styles.quickCommandButton, {backgroundColor: '#FF9500'}]}

  onPress={async () => {
    // Testa envio de texto simples
    const testText = "Hello BLE";
    const textBytes = Array.from(Buffer.from(testText + '\r\n', 'utf8'));

    try {
      await BleManager.write(peripheralId, serviceToWrite, charToWrite, textBytes);
      console.log('Texto enviado:', testText);

      // Aguarda resposta
      await new Promise<void>(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Erro:', error);
    }

  }}
>
  <Text style={styles.quickCommandText}>Test Text</Text>
</TouchableOpacity>

      {/* Write Interaction Card */}
      {isNusDevice && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Write to Characteristic</Text>
          {serviceToWrite && charToWrite ? (
            <>
              <Text style={styles.inputLabel}>Service: {serviceToWrite.slice(0,8)}... Char: {charToWrite.slice(0,8)}... (NUS RX)</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="Type data to write (UTF-8)"
                value={textToWrite}
                onChangeText={setTextToWrite}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.styledButton} onPress={() => writeTextToDevice(textToWrite)}>
                <Text style={styles.styledButtonText}>Write</Text>
              </TouchableOpacity>

              {isNusDevice && ( // Mostra comandos FitPro somente se for um dispositivo NUS
                <View style={styles.quickCommandsContainer}>
                    <Text style={styles.quickCommandsLabel}>FitPro Commands (for Watch):</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity
                        style={styles.quickCommandButton}
                        onPress={sendFindBandFitPro}
                        >
                        <Text style={styles.quickCommandText}>Find Band</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                        style={styles.quickCommandButton}
                        onPress={sendGetHwInfoFitPro}
                        >
                        <Text style={styles.quickCommandText}>HW Info</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                        style={[styles.quickCommandButton, {backgroundColor: '#4CAF50'}]}
                        onPress={initializeLT716Device}
                        >
                        <Text style={styles.quickCommandText}>Init Device</Text>
                        </TouchableOpacity>
                        {/* Adicione outros botões de comando FitPro aqui */}
                    </ScrollView>
                </View>
              )}

              <TouchableOpacity
                style={[styles.styledButton, {backgroundColor: '#34C759', marginTop: 10}]}
                onPress={restartNotifications}
              >
                <Text style={styles.styledButtonText}>🔄 Restart Notifications</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.infoValue}>No writable characteristic configured for this device type yet.</Text>
          )}
        </View>
      )}

      {/* Data Display Card (for read results, write confirmations) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Data Log</Text>
         <ScrollView style={styles.dataDisplayBox} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}>
          <Text style={styles.dataDisplayText}>{readData || 'No data operations yet.'}</Text>
        </ScrollView>
         <TouchableOpacity style={[styles.clearButton]} onPress={() => setReadData('')}>
            <Text style={styles.clearButtonText}>Clear Data Log</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications Card - Shows data received from the device */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications (Received Data)</Text>
        <ScrollView
          style={styles.notificationBox}
          ref={notificationsScrollViewRef}
          onContentSizeChange={() => notificationsScrollViewRef.current?.scrollTo({ y: 0, animated: true })} // Rola para o topo para ver a msg mais recente
        >
          <Text style={styles.notificationText}>
            {notificationLog || 'Waiting for notifications from device...'}
          </Text>
        </ScrollView>
        <TouchableOpacity
          style={[styles.clearButton, {backgroundColor: '#FF9500'}]}
          onPress={() => setNotificationLog('')}
        >
          <Text style={styles.clearButtonText}>Clear Notifications</Text>
        </TouchableOpacity>
      </View>



      {/* RSSI Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={rssiModalVisible}
        onRequestClose={() => setRssiModalVisible(false)}
      >
        <View style={styles.modalCenteredView}>
          <Animated.View
          style={[
            styles.modalView,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
            }
          ]}
        >
            <Text style={styles.modalTitle}>RSSI (Signal Strength)</Text>
            {currentRSSI !== null && (
              <Text style={styles.modalTextCurrentRssi}>Current: {currentRSSI} dBm</Text>
            )}
            {rssiHistory.length > 1 ? (
               <View style={{alignItems: 'center', paddingVertical: 10}}>
                 <LineChart
                    data={rssiHistory}
                    height={200}
                    width={chartWidth * 0.67} // Adjust width for modal
                    yAxisLabelSuffix=" dBm"
                    yAxisTextStyle={{ color: '#555', fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: '#555', fontSize: 10, textAlign: 'center' }}
                    spacing={Math.max(20, Math.min(40, (chartWidth * 0.9) / (rssiHistory.length > 1 ? rssiHistory.length : 2)))}
                    initialSpacing={10}
                    color="#007AFF"
                    thickness={2}
                    curved
                    areaChart
                    startFillColor="rgba(0, 122, 255, 0.2)"
                    endFillColor="rgba(0, 122, 255, 0.01)"
                    dataPointsColor="#007AFF"
                    dataPointsRadius={3}
                    showVerticalLines
                    verticalLinesColor="rgba(0,0,0,0.05)"


                    // @ts-ignore - These props work at runtime but aren't in the type definitions
                    minValue={-100}
                    // @ts-ignore
                    maxValue={-100}
                    yAxisLabelTexts={['-100', '-90', '-80', '-70', '-60', '-50', '-40', '-30']}
                    noOfSections={7}
                />
              </View>
            ) : (
              <Text style={styles.modalText}>Collecting RSSI data... ({rssiHistory.length}/{MAX_RSSI_HISTORY})</Text>
            )}
            <TouchableOpacity
              style={[styles.styledButton, styles.modalCloseButton]}
              onPress={() => setRssiModalVisible(false)}
            >
              <Text style={styles.styledButtonText}>Close Chart</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Componente visual para mostrar mensagens decodificadas
const FitProMessageDecoder = ({ message }: { message: number[] }) => {
  const decoded = decodeFitProMessage(message);

  return (
    <View style={styles.decodedMessageBox}>
      <Text style={styles.decodedMessageText}>{decoded}</Text>
    </View>
  );
};

// Função para testar comandos e ver respostas
const testFitProCommands = async (writeBytesToDevice: (bytes: number[], description: string) => Promise<boolean>) => {
  console.log('🧪 Testando comandos FitPro...');

  // Array de comandos para testar
  const testCommands = [
    {
      name: 'Get Steps',
      cmd: buildFitProCommand(0x15, 0x06, [0x01])
    },
    {
      name: 'Get Heart Rate',
      cmd: buildFitProCommand(0x12, 0x0D, [0x01])
    },
    {
      name: 'Get Band Name',
      cmd: buildFitProCommand(0x20, 0x23, [])
    }
  ];

  for (const test of testCommands) {
    console.log(`\n📤 Enviando: ${test.name}`);
    const success = await writeBytesToDevice(test.cmd, test.name);
    if (!success) {
      console.warn(`⚠️ Falha ao enviar comando: ${test.name}`);
      continue;
    }

    // Aguarda resposta
    await new Promise<void>(resolve => setTimeout(resolve, 1500));
  }
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F0F0F7', // Light gray background like iOS settings
    paddingHorizontal: 10, // Use padding on ScrollView for consistent spacing
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 15, // Inner padding for header content
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
    marginTop: Platform.OS === 'ios' ? 0 : 10, // Adjust for status bar if needed
    borderRadius: 10,
    marginBottom: 15,
     shadowColor: "#000",
    shadowOffset: {
        width: 0,
        height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceNameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  deviceMacText: {
    fontSize: 13,
    color: '#8A8A8E', // Lighter gray for MAC
    marginTop: 2,
  },
  headerStatus: {
    alignItems: 'flex-end',
  },
  statusConnectedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#34C759', // iOS Green for connected
  },
  notificationBox: {
    backgroundColor: '#F0F0F7',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    padding: 10,
    minHeight: 120,
    maxHeight: 200,
    marginBottom: 10,
  },
  notificationText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  quickCommandsContainer: {
    marginVertical: 10,
  },
  quickCommandsLabel: {
    fontSize: 13,
    color: '#6D6D72',
    marginBottom: 8,
  },
  quickCommandButton: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  quickCommandText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  rssiText: {
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600', // Semibold
    color: '#000000',
    marginBottom: 10, // Space below title
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4', // Very light separator
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8, // Consistent padding for rows
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  infoRowNoBorder: { // For the last item in a list or single items
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: '#000000',
  },
  infoValue: {
    fontSize: 15,
    color: '#8A8A8E', // Gray for values, or N/A
    textAlign: 'right',
  },
  heatmapContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  heatmapLegend: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryOutline: {
    width: 24,
    height: 12,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 2,
    padding: 1,
    justifyContent: 'center',
  },
  batteryFill: {
    height: 8,
    borderRadius: 1,
  },
  batteryTip: {
    width: 2,
    height: 4,
    backgroundColor: '#000',
    marginLeft: 1,
  },
  batteryText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#000',
  },
  batteryLevelText: {
    color: '#34C759',
    fontWeight: '600',
    textShadowColor: 'rgba(52, 199, 89, 0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  rssiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEFF4', // Light gray button background
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  rssiButtonIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#007AFF', // Blue icon
  },
  rssiButtonText: {
    fontSize: 15,
    color: '#007AFF', // Blue text
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 13,
    color: '#6D6D72', // Slightly darker gray for labels
    marginBottom: 5,
    marginTop: 5,
  },
  textInputStyle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D1D6', // Standard border color
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000000',
    marginBottom: 12,
  },
  styledButton: {
    backgroundColor: '#007AFF', // iOS Blue
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // iOS standard tap height
  },
  styledButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  updateButton: {
    backgroundColor: '#EFEFF4', // Lighter for secondary actions
  },
  // updateButtonText: { // Inherits styledButtonText, override if needed for color
  //   color: '#007AFF',
  // },
  dataDisplayBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    padding: 10,
    minHeight: 100,
    maxHeight: 150, // Limit height for scroll
    marginBottom: 10,
  },
  dataDisplayText: {
    fontSize: 13,
    color: '#333333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', // Monospace for logs
  },
  clearButton: {
    backgroundColor: '#FF3B30', // iOS Red for destructive actions
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-end', // Position to the right
    marginTop: 0,
  },
  clearButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '500',
  },
  // Modal Styles
  modalCenteredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', // Semi-transparent background
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 14, // iOS modal radius
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  decodedMessageBox: {
    backgroundColor: '#F0F8FF',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 10,
    marginVertical: 5,
  },
  decodedMessageText: {
    fontSize: 13,
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
    modalTextCurrentRssi: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 15,
    color: '#007AFF',
  },
  modalCloseButton: {
    marginTop: 15,
    width: '100%', // Make button full width in modal
  },
  // Service Item Styles
  serviceCardItem: {
    backgroundColor: '#FFFFFF', // Match card background if services are outside a main card
    // If inside a card, these might not need separate background/border
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
    // paddingVertical: 5, // Add padding if items are directly in a ScrollView
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12, // Consistent padding
    // paddingHorizontal: 15, // If serviceCardItem doesn't have it
  },
  serviceIcon: {
    marginRight: 8,
    fontSize: 15,
    color: '#007AFF', // Blue for icon-like elements
  },
  serviceUUID: {
    fontSize: 15,
    color: '#000000',
    flex: 1, // Allow text to take available space
  },
  serviceArrow: {
    fontSize: 18,
    color: '#C7C7CC', // Light gray for disclosure indicator
  },
  characteristicsList: {
    paddingLeft: 20, // Indent characteristics
    paddingBottom: 5,
  },
  characteristicItem: {
    paddingVertical: 6,
  },
  characteristicUUID: {
    fontSize: 13,
    color: '#333',
  },
  characteristicProps: {
    fontSize: 12,
    color: '#8A8A8E',
    fontStyle: 'italic',
  },
  // Decoder styles
});

export default PeripheralDetailsScreen;
function isPrintableText(text: string): boolean {
  // Regular expression that matches any non-printable ASCII character
  // except for newlines, tabs, etc.
  const nonPrintableRegex = /[^\x20-\x7E\n\r\t]/;
  return !nonPrintableRegex.test(text);
}