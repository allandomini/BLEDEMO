import BleManager from 'react-native-ble-manager';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { requestBluetoothPermissions } from '../utils/PermissionUtils';

class BleService {
  private static instance: BleService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): BleService {
    if (!BleService.instance) {
      BleService.instance = new BleService();
    }
    return BleService.instance;
  }

  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('BLE Manager already initialized');
      return true;
    }

    try {
      console.log('Initializing BLE Manager...');
      
      // Request necessary permissions first
      if (Platform.OS === 'android') {
        const hasPermissions = await requestBluetoothPermissions();
        if (!hasPermissions) {
          console.warn('Bluetooth permissions not granted');
          Alert.alert(
            'Permissões Necessárias',
            'O aplicativo precisa de permissões de Bluetooth e Localização para funcionar corretamente.',
            [{ text: 'OK' }]
          );
          return false;
        }
      }
      
      // Initialize the BLE Manager
      await BleManager.start({ showAlert: true });
      this.isInitialized = true;
      
      console.log('BLE Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
      Alert.alert(
        'Erro',
        'Não foi possível inicializar o Bluetooth. Por favor, verifique se o Bluetooth está ativado e tente novamente.',
        [{ text: 'OK' }]
      );
      return false;
    }
  }

  public async checkBluetoothState(): Promise<string> {
    try {
      return await BleManager.checkState();
    } catch (error) {
      console.error('Error checking Bluetooth state:', error);
      throw error;
    }
  }

  public async connectToDevice(peripheralId: string): Promise<boolean> {
    try {
      console.log(`Connecting to device ${peripheralId}...`);
      await BleManager.connect(peripheralId);
      console.log(`Successfully connected to ${peripheralId}`);
      return true;
    } catch (error) {
      console.error(`Failed to connect to device ${peripheralId}:`, error);
      throw error;
    }
  }

  public async disconnectDevice(peripheralId: string): Promise<boolean> {
    try {
      console.log(`Disconnecting from device ${peripheralId}...`);
      await BleManager.disconnect(peripheralId);
      console.log(`Successfully disconnected from ${peripheralId}`);
      return true;
    } catch (error) {
      console.error(`Failed to disconnect from device ${peripheralId}:`, error);
      throw error;
    }
  }

  public async getConnectedDevices(serviceUUIDs: string[] = []): Promise<any[]> {
    try {
      return await BleManager.getConnectedPeripherals(serviceUUIDs);
    } catch (error) {
      console.error('Error getting connected devices:', error);
      throw error;
    }
  }
}

export const bleService = BleService.getInstance();
