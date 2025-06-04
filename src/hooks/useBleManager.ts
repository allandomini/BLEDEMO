import { useEffect, useState, useCallback, useRef } from 'react';
import BleManager from 'react-native-ble-manager';
import type { Peripheral } from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules, Platform, PermissionsAndroid, Alert } from 'react-native';

const BleManagerModule = NativeModules.BleManager;
let bleManagerEmitter: NativeEventEmitter | null = null;
let isBleManagerGloballyInitialized = false;

const ensureBleManagerInitialized = async (): Promise<boolean> => {
  if (isBleManagerGloballyInitialized) {
    return true;
  }
  try {
    console.log('[useBleManager] Tentando BleManager.start()...');
    await BleManager.start({ showAlert: false });
    console.log('[useBleManager] BleManager.start() SUCESSO.');
    isBleManagerGloballyInitialized = true;
    return true;
  } catch (error) {
    console.error('[useBleManager] BleManager.start() FALHOU:', error);
    Alert.alert("Erro Crítico", "Falha ao inicializar o BleManager.");
    return false;
  }
};

const useBleManager = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bluetoothState, setBluetoothState] = useState<string>('unknown');
  
  const discoverPeripheralListener = useRef<any>(null);
  const stopScanListener = useRef<any>(null);
  const updateStateListener = useRef<any>(null);

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

    if (BleManagerModule) {
      if (!bleManagerEmitter) {
        bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
        console.log('[useBleManager] NativeEventEmitter criado.');
      }
    } else {
      console.error('[useBleManager] NativeModules.BleManager NÃO ESTÁ DISPONÍVEL. Listeners de eventos podem não funcionar.');
    }

    if (Platform.OS === 'android') {
      const permissionsGranted = await handleAndroidPermissions();
      if (!permissionsGranted) {
        setError("Permissões de Bluetooth e Localização são necessárias.");
        setIsInitializing(false);
        setIsInitialized(false);
        return false;
      }
    }
    
    try {
      console.log('[useBleManager] Verificando estado do Bluetooth...');
      await BleManager.checkState(); 
    } catch (checkStateError) {
        console.error('[useBleManager] Erro ao chamar BleManager.checkState():', checkStateError);
        setError("Não foi possível verificar o estado do Bluetooth.");
    }

    setIsInitializing(false);
    setIsInitialized(true); 
    console.log('[useBleManager] Hook inicializado.');
    return true;
  }, []);

  const handleAndroidPermissions = async () => {
    if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        if (
          result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          console.log('[useBleManager] Permissões Android BLE concedidas.');
          return true;
        } else {
          console.error('[useBleManager] Permissões Android BLE negadas.', result);
          Alert.alert("Erro", "Permissões de Bluetooth e Localização não concedidas.");
          return false;
        }
    }
    return true; 
  };

  const startScan = useCallback(async (
    serviceUUIDs: string[],
    seconds: number,
    allowDuplicates: boolean,
    options: any = {}, 
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
      await stopScan(); // Certificando-se de parar o scan anterior antes de iniciar um novo
      setIsScanning(false); 
    }

    console.log('[useBleManager] Iniciando scan...');
    setError(null);
    setIsScanning(true);

    discoverPeripheralListener.current?.remove();
    discoverPeripheralListener.current = BleManager.onDiscoverPeripheral(onDeviceFound);
    
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

  // Função para parar o scan (nova função)
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

  useEffect(() => {
    initializeBle();

    if (bleManagerEmitter) {
      console.log('[useBleManager] Registrando listener BleManagerDidUpdateState...');
      updateStateListener.current = bleManagerEmitter.addListener(
        'BleManagerDidUpdateState',
        (args: { state: string }) => {
          console.log('[useBleManager] Estado do Bluetooth alterado:', args.state);
          setBluetoothState(args.state);
          if (args.state === 'off' || args.state === 'unauthorized' || args.state === 'unsupported') {
            Alert.alert('Bluetooth Desativado', 'Por favor, ative o Bluetooth para usar as funcionalidades BLE.');
            setIsScanning(false); 
            setError("Bluetooth não está ativo.");
            setIsInitialized(false); 
          } else if (args.state === 'on') {
            setError(null);
          }
        }
      );
    } else {
        console.warn("[useBleManager] bleManagerEmitter não está disponível, não é possível registrar listener de estado.");
    }

    return () => {
      console.log('[useBleManager] Limpando listeners...');
      if (discoverPeripheralListener.current) {
        discoverPeripheralListener.current.remove();
      }
      if (stopScanListener.current) {
        stopScanListener.current.remove();
      }
      if (updateStateListener.current) {
        updateStateListener.current.remove();
      }
    };
  }, [initializeBle]);

  return {
    isInitialized,
    isInitializing,
    isScanning,
    bluetoothState,
    error,
    initializeBle, 
    startScan,
    stopScan, 
  };
};

export default useBleManager;