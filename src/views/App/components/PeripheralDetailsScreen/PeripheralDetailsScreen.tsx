// SOLUÇÃO SUPER SIMPLES - NOTIFICAÇÕES BÁSICAS

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import BleManager, { PeripheralInfo, BleManagerDidUpdateValueForCharacteristicEvent } from 'react-native-ble-manager';

type MessageType = 'sent' | 'received' | 'system' | 'error';

interface LogMessage {
  id: string;
  text: string;
  timestamp: number;
  type: MessageType;
}

const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9d';
const NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9d';
const NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9d';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = BleManagerModule ? new NativeEventEmitter(BleManagerModule) : null;

interface PeripheralDetailsProps {
  route: { params: { peripheralData: PeripheralInfo } };
}

const PeripheralDetailsScreen = ({ route }: PeripheralDetailsProps) => {
  const { peripheralData } = route.params;
  const peripheralId = peripheralData.id;

  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [textToWrite, setTextToWrite] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  const isMacBook = peripheralData.name?.includes('MacBook') || peripheralData.name?.includes('MyMacBookGUI');

  // Add message
  const addMessage = useCallback((text: string, type: MessageType = 'received') => {
    const messageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    setMessages(prev => [{
      id: messageId,
      text,
      timestamp: Date.now(),
      type
    }, ...prev].slice(0, 200));
  }, []);

  // Write data
  const writeBytesToDevice = useCallback(async (bytesToSend: number[]): Promise<boolean> => {
    try {
      await BleManager.writeWithoutResponse(peripheralId, NUS_SERVICE_UUID, NUS_RX_CHAR_UUID, bytesToSend);
      const sentText = Buffer.from(bytesToSend).toString('utf8');
      addMessage(`EU: "${sentText}"`, 'sent');
      return true;
    } catch (error) {
      addMessage(`❌ Erro: ${error}`, 'error');
      return false;
    }
  }, [peripheralId, addMessage]);

  // Setup notifications
  useEffect(() => {
    let subscription: any = null;
    
    const setupNotifications = async () => {
      try {
        console.log('Ativando notificações...');
        
        // Ativa notificações
        await BleManager.startNotification(peripheralId, NUS_SERVICE_UUID, NUS_TX_CHAR_UUID);
        console.log('Notificações ativadas!');
        addMessage('✅ Notificações ativadas', 'system');
        
        // Configura listener
        if (bleManagerEmitter) {
          console.log('Configurando listener...');
          
          subscription = bleManagerEmitter.addListener(
            'BleManagerDidUpdateValueForCharacteristic',
            (data: BleManagerDidUpdateValueForCharacteristicEvent) => {
              console.log('Evento recebido:', data);
              
              if (data.peripheral === peripheralId) {
                try {
                  const message = Buffer.from(data.value).toString('utf-8');
                  console.log('Mensagem:', message);
                  addMessage(`MacBook: "${message}"`, 'received');
                } catch (error) {
                  console.error('Erro ao processar:', error);
                }
              }
            }
          );
          
          console.log('Listener configurado!');
        } else {
          console.error('BleManagerEmitter não disponível!');
          addMessage('❌ Erro: EventEmitter não disponível', 'error');
        }
        
      } catch (error) {
        console.error('Erro ao configurar notificações:', error);
        addMessage(`❌ Erro: ${error}`, 'error');
      }
    };

    // Aguarda um pouco antes de configurar
    const timer = setTimeout(() => {
      setupNotifications();
      setIsReady(true);
    }, 1000);

    // Cleanup
    return () => {
      clearTimeout(timer);
      if (subscription) {
        subscription.remove();
      }
    };
  }, [peripheralId, addMessage]);

  const getMessageBackgroundColor = (type: MessageType): string => {
    switch (type) {
      case 'sent': return '#007AFF';
      case 'received': return '#34C759';
      case 'error': return '#FF3B30';
      case 'system': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  return (
    <ScrollView style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <Text style={styles.deviceNameText}>{peripheralData.name}</Text>
        <Text style={styles.statusConnectedText}>Connected</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Chat</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInputStyle}
            placeholder="Digite sua mensagem..."
            value={textToWrite}
            onChangeText={setTextToWrite}
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={async () => {
              if (textToWrite.trim()) {
                const bytesToSend = Array.from(Buffer.from(textToWrite, 'utf8'));
                if (await writeBytesToDevice(bytesToSend)) {
                  setTextToWrite('');
                }
              }
            }}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={async () => {
              if (textToWrite.trim()) {
                const bytesToSend = Array.from(Buffer.from(textToWrite, 'utf8'));
                if (await writeBytesToDevice(bytesToSend)) {
                  setTextToWrite('');
                }
              }
            }}
          >
            <Text style={styles.sendButtonText}>Enviar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.chatHeader}>
          <Text style={styles.cardTitle}>Mensagens</Text>
          <TouchableOpacity onPress={() => setMessages([])}>
            <Text style={styles.clearText}>Limpar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chatBox}>
          {messages.length > 0 ? (
            [...messages].reverse().map((msg) => (
              <View key={msg.id} style={[
                styles.messageContainer,
                {
                  backgroundColor: getMessageBackgroundColor(msg.type),
                  alignSelf: msg.type === 'sent' ? 'flex-end' : 'flex-start',
                }
              ]}>
                <Text style={styles.messageText}>{msg.text}</Text>
                <Text style={styles.messageTime}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Aguardando mensagens...</Text>
          )}
        </View>
      </View>

      <TouchableOpacity 
        style={styles.debugButton}
        onPress={() => {
          console.log('=== DEBUG INFO ===');
          console.log('BleManagerModule:', !!BleManagerModule);
          console.log('bleManagerEmitter:', !!bleManagerEmitter);
          console.log('peripheralId:', peripheralId);
          console.log('isReady:', isReady);
          console.log('==================');
          addMessage(`Debug: Module=${!!BleManagerModule}, Emitter=${!!bleManagerEmitter}`, 'system');
        }}
      >
        <Text style={styles.debugButtonText}>🐛 Debug Info</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  headerContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8'
  },
  deviceNameText: { fontSize: 20, fontWeight: '600', color: '#000' },
  statusConnectedText: { fontSize: 14, color: '#34C759' },
  card: { 
    backgroundColor: '#FFF', 
    borderRadius: 10, 
    padding: 16, 
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  inputContainer: { flexDirection: 'row', gap: 10 },
  textInputStyle: { 
    flex: 1,
    backgroundColor: '#F2F2F7', 
    borderWidth: 1, 
    borderColor: '#E5E5EA', 
    borderRadius: 20, 
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendButton: { 
    backgroundColor: '#007AFF', 
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearText: { color: '#007AFF', fontSize: 15 },
  chatBox: { 
    backgroundColor: '#F2F2F7', 
    borderRadius: 8, 
    padding: 12,
    minHeight: 300,
  },
  messageContainer: {
    padding: 10,
    borderRadius: 16,
    marginBottom: 8,
    maxWidth: '75%',
  },
  messageText: { fontSize: 15, color: '#FFF', marginBottom: 4 },
  messageTime: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  emptyText: { 
    fontSize: 14, 
    color: '#8E8E93', 
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  debugButton: {
    backgroundColor: '#8E8E93',
    padding: 15,
    margin: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  debugButtonText: { color: '#FFF', fontWeight: '600' },
});

export default PeripheralDetailsScreen;