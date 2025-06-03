// src/hooks/useBleManager.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import BleManager from 'react-native-ble-manager';
import type { Peripheral, PeripheralInfo } from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules, Platform, PermissionsAndroid, Alert, EmitterSubscription } from 'react-native';

// Define the State enum since it's not exported from the module
export enum State {
  Unknown = 'unknown',
  Resetting = 'resetting',
  Unsupported = 'unsupported',
  Unauthorized = 'unauthorized',
  On = 'on',
  Off = 'off',
  TurningOn = 'turning_on',
  TurningOff = 'turning_off',
}

// Define the BleDisconnectPeripheralEvent type
export interface BleDisconnectPeripheralEvent {
  identifier: string;
  device: string;
  status: number;
}

const BleManagerModule = NativeModules.BleManager;
let bleManagerEmitter: NativeEventEmitter | null = null; // Será inicializado uma vez

// Para garantir que BleManager.start() seja chamado apenas uma vez globalmente.
let isBleManagerGloballyInitialized = false;
const ensureBleManagerInitialized = async (): Promise<boolean> => {
  if (isBleManagerGloballyInitialized) {
    return true;
  }
  try {
    console.log('[useBleManager] Tentando BleManager.start()...');
    await BleManager.start({ showAlert: false }); // showAlert: true pode ser útil para debug inicial
    console.log('[useBleManager] BleManager.start() SUCESSO.');
    isBleManagerGloballyInitialized = true;
    return true;
  } catch (error) {
    console.error('[useBleManager] BleManager.start() FALHOU:', error);
    Alert.alert("Erro Crítico", "Falha ao inicializar o BleManager.");
    return false;
  }
};


interface UseBleManagerReturn {
  isInitialized: boolean;
  isInitializing: boolean;
  isScanning: boolean;
  bluetoothState: State;
  error: string | null;
  peripherals: Map<string, any>;
  initializeBle: () => Promise<boolean>;
  startScan: (serviceUUIDs: string[], seconds: number, allowDuplicates: boolean, options: any, onDeviceFound: (device: Peripheral) => void) => Promise<boolean>;
  stopScan: () => Promise<boolean>;
  startDeviceScan: () => Promise<void>;
  connectPeripheral: (peripheral: Peripheral) => Promise<boolean>;
  disconnectPeripheral: (peripheralId: string) => Promise<boolean>;
  onDisconnectPeripheral: (handler: (event: BleDisconnectPeripheralEvent) => void) => any;
}

export const useBleManager = (): UseBleManagerReturn => {
  const [isInitialized, setIsInitialized] = useState(false); // Se o hook está pronto (incluindo permissões)
  const [isInitializing, setIsInitializing] = useState(true); // Estado de carregamento inicial
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);

  // Listeners - using any type to avoid type conflicts with react-native-ble-manager
  const discoverPeripheralListener = useRef<any>(null);
  const stopScanListener = useRef<any>(null);
  const updateStateListener = useRef<any>(null);
  const disconnectPeripheralListener = useRef<any>(null); // For ScanDevicesScreen

  const initializeBle = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    const bleManagerReady = await ensureBleManagerInitialized();
    if (!bleManagerReady) {
      setError("Falha ao inicializar o módulo BleManager globalmente.");
      setIsInitializing(false);
      setIsInitialized(false);
      return false;
    }

    // Inicializa o emitter APENAS SE NativeModules.BleManager estiver disponível
    // Este ainda é o ponto problemático que observamos antes.
    if (BleManagerModule) {
      if (!bleManagerEmitter) { // Cria apenas uma vez globalmente para o app
        bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
        console.log('[useBleManager] NativeEventEmitter criado.');
      }
    } else {
      console.error('[useBleManager] NativeModules.BleManager NÃO ESTÁ DISPONÍVEL. Listeners de eventos podem não funcionar.');
      // Não vamos setar erro aqui, pois o scan pode funcionar via API da lib
      // mas é um aviso importante.
    }

    // Permissões (iOS é via Info.plist, Android é em runtime)
    if (Platform.OS === 'android') {
      const permissionsGranted = await handleAndroidPermissions();
      if (!permissionsGranted) {
        setError("Permissões de Bluetooth e Localização são necessárias.");
        setIsInitializing(false);
        setIsInitialized(false);
        return false;
      }
    }
    
    // Verificar estado do Bluetooth
    try {
      console.log('[useBleManager] Verificando estado do Bluetooth...');
      await BleManager.checkState(); // Dispara BleManagerDidUpdateState
      // O listener abaixo vai capturar o estado
    } catch (checkStateError) {
        console.error('[useBleManager] Erro ao chamar BleManager.checkState():', checkStateError);
        setError("Não foi possível verificar o estado do Bluetooth.");
    }


    setIsInitializing(false);
    setIsInitialized(true); // Considera inicializado após permissões e start
    console.log('[useBleManager] Hook inicializado.');
    return true;
  }, []);

  const handleAndroidPermissions = async () => {
    // ... (código de permissões Android como no seu App.tsx de teste - Turn 38)
    if (Platform.OS === 'android') {
        if (Platform.Version >= 31) {
            const SDC = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN;
            const CDC = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
            const LAF = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
            const result = await PermissionsAndroid.requestMultiple([SDC, CDC, LAF]);
            if (result[SDC] === PermissionsAndroid.RESULTS.GRANTED &&
                result[CDC] === PermissionsAndroid.RESULTS.GRANTED &&
                result[LAF] === PermissionsAndroid.RESULTS.GRANTED) {
                console.log('[useBleManager] Permissões Android BLE (API 31+) concedidas.');
                return true;
            } else {
                console.warn('[useBleManager] Permissões Android BLE (API 31+) negadas.', result);
                return false;
            }
        } else { // Android 6-11
            const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            if (result === PermissionsAndroid.RESULTS.GRANTED) {
                console.log('[useBleManager] Permissão Localização (API <31) concedida.');
                return true;
            } else {
                console.warn('[useBleManager] Permissão Localização (API <31) negada.');
                return false;
            }
        }
    }
    return true; // Para iOS
  };
  
  // Efeito para inicializar e registrar listeners globais do hook
  useEffect(() => {
    initializeBle();

    if (bleManagerEmitter) {
      console.log('[useBleManager] Registrando listener BleManagerDidUpdateState...');
      updateStateListener.current = bleManagerEmitter.addListener(
        'BleManagerDidUpdateState',
        (args: { state: State }) => {
          console.log('[useBleManager] Estado do Bluetooth alterado:', args.state);
          setBluetoothState(args.state);
          if (args.state === 'off' || args.state === 'unauthorized' || args.state === 'unsupported') {
            Alert.alert('Bluetooth Desativado', 'Por favor, ative o Bluetooth para usar as funcionalidades BLE.');
            setIsScanning(false); // Para o scan se o bluetooth for desligado
            setError("Bluetooth não está ativo.");
            setIsInitialized(false); // Requer nova inicialização ou tratamento
          } else if (args.state === 'on') {
            setError(null); // Limpa erro se o bluetooth ligar
            // Não reinicializa automaticamente aqui, deixa o usuário/componente decidir
          }
        }
      );
    } else {
        console.warn("[useBleManager] bleManagerEmitter não está disponível, não é possível registrar listener de estado.");
    }

    return () => {
      console.log('[useBleManager] Limpando listeners do hook...');
      if (discoverPeripheralListener.current) {
        (discoverPeripheralListener.current as any).remove();
      }
      if (stopScanListener.current) {
        (stopScanListener.current as any).remove();
      }
      if (updateStateListener.current) {
        (updateStateListener.current as any).remove();
      }
      if (disconnectPeripheralListener.current) {
        (disconnectPeripheralListener.current as any).remove();
      }
    };
  }, [initializeBle]);


  const startScan = useCallback(async (
    serviceUUIDs: string[],
    seconds: number,
    allowDuplicates: boolean,
    options: any = {}, // Adicionar tipo apropriado se souber
    onDeviceFound: (device: Peripheral) => void
  ) => {
    if (!isInitialized || bluetoothState !== 'on') {
      setError("Bluetooth não está pronto ou ativado. Tente inicializar novamente ou ative o Bluetooth.");
      Alert.alert("Erro", "Bluetooth não está pronto ou ativado. Verifique o estado e as permissões.");
      console.warn('[useBleManager] Tentativa de scan sem inicialização ou Bluetooth desligado. Status:', bluetoothState);
      return false;
    }
    if (isScanning) {
      console.log('[useBleManager] Scan já em progresso. Parando scan anterior...');
      await BleManager.stopScan(); // Garante que para antes de um novo
      setIsScanning(false); // Atualiza estado antes de re-escanear
    }

    console.log('[useBleManager] Iniciando scan...');
    setError(null);
    setIsScanning(true);

    // Remove listener antigo de descoberta se existir, antes de adicionar um novo
    discoverPeripheralListener.current?.remove();
    discoverPeripheralListener.current = BleManager.onDiscoverPeripheral(onDeviceFound);
    
    // Remove listener antigo de parada de scan se existir
    stopScanListener.current?.remove();
    stopScanListener.current = BleManager.onStopScan(() => {
        console.log('[useBleManager] Scan parado (evento onStopScan).');
        setIsScanning(false);
    });

    try {
      await BleManager.scan(serviceUUIDs, seconds, allowDuplicates, options);
      console.log('[useBleManager] Comando de scan enviado.');
      return true;
    } catch (scanError: any) {
      console.error('[useBleManager] Erro ao iniciar scan:', scanError);
      setError(`Erro no scan: ${scanError.message || scanError}`);
      setIsScanning(false);
      discoverPeripheralListener.current?.remove();
      stopScanListener.current?.remove();
      return false;
    }
  }, [isInitialized, isScanning, bluetoothState]);

  const stopScan = useCallback(async () => {
    if (!isScanning) {
      console.log('[useBleManager] Nenhum scan em progresso para parar.');
      return true;
    }
    console.log('[useBleManager] Parando scan manualmente...');
    try {
      await BleManager.stopScan();
      // O estado isScanning será atualizado pelo listener onStopScan
      return true;
    } catch (stopScanError: any) {
      console.error('[useBleManager] Erro ao parar scan:', stopScanError);
      setError(`Erro ao parar scan: ${stopScanError.message || stopScanError}`);
      return false;
    }
  }, [isScanning]);
  
  // Função para registrar listener de desconexão (para ser usado pelo ScanDevicesScreen)
  const onDisconnectPeripheral = useCallback((handler: (event: BleDisconnectPeripheralEvent) => void) => {
    if (bleManagerEmitter) {
      disconnectPeripheralListener.current?.remove(); // Remove listener antigo
      disconnectPeripheralListener.current = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', handler);
      return disconnectPeripheralListener.current;
    }
    console.warn("[useBleManager] bleManagerEmitter não disponível, não é possível registrar listener de desconexão.");
    return null;
  }, []);


  // Add missing functions to connect and disconnect peripherals
  const connectPeripheral = useCallback(async (peripheral: Peripheral) => {
    try {
      console.log(`[useBleManager] Connecting to peripheral: ${peripheral.id}`);
      await BleManager.connect(peripheral.id);
      console.log(`[useBleManager] Connected to peripheral: ${peripheral.id}`);
      return true;
    } catch (error) {
      console.error(`[useBleManager] Error connecting to peripheral ${peripheral.id}:`, error);
      throw error;
    }
  }, []);

  const disconnectPeripheral = useCallback(async (peripheralId: string) => {
    try {
      console.log(`[useBleManager] Disconnecting from peripheral: ${peripheralId}`);
      await BleManager.disconnect(peripheralId);
      console.log(`[useBleManager] Disconnected from peripheral: ${peripheralId}`);
      return true;
    } catch (error) {
      console.error(`[useBleManager] Error disconnecting from peripheral ${peripheralId}:`, error);
      throw error;
    }
  }, []);

  // Add a function to start device scan with default parameters
  const startDeviceScan = useCallback(async () => {
    try {
      await startScan([], 5, false, {}, (device) => {
        console.log('Device found:', device);
      });
    } catch (error) {
      console.error('Error starting device scan:', error);
      throw error;
    }
  }, [startScan]);

  return {
    isInitialized,
    isInitializing,
    isScanning,
    bluetoothState,
    error,
    peripherals: new Map<string, any>(), // Return an empty Map for now
    initializeBle, // Expor para reinicialização manual se necessário
    startScan,
    stopScan,
    startDeviceScan, // Add the new function
    connectPeripheral, // Add the connect function
    disconnectPeripheral, // Add the disconnect function
    onDisconnectPeripheral, // Expor a função para adicionar o listener
  };
};