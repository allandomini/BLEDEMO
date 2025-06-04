import { useState, useEffect, useCallback } from 'react';
import { bleService } from '../services/BleService';
import { Alert } from 'react-native';

export const useBle = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);

  // Initialize BLE
  const initializeBle = useCallback(async () => {
    try {
      const initialized = await bleService.initialize();
      setIsInitialized(initialized);
      if (!initialized) {
        setError('Falha ao inicializar o Bluetooth');
      }
      return initialized;
    } catch (err) {
      console.error('BLE initialization error:', err);
      setError('Erro ao inicializar o Bluetooth');
      return false;
    }
  }, []);

  // Check if Bluetooth is enabled
  const checkBluetoothState = useCallback(async () => {
    try {
      const state = await bleService.checkBluetoothState();
      return state === 'on' || state === 'turning_on';
    } catch (err) {
      console.error('Error checking Bluetooth state:', err);
      return false;
    }
  }, []);

  // Connect to a device
  const connectToDevice = useCallback(async (peripheralId: string) => {
    try {
      const connected = await bleService.connectToDevice(peripheralId);
      if (connected) {
        setConnectedDevice(peripheralId);
      }
      return connected;
    } catch (err) {
      console.error('Connection error:', err);
      setError('Falha ao conectar ao dispositivo');
      return false;
    }
  }, []);

  // Disconnect from a device
  const disconnectDevice = useCallback(async (peripheralId: string) => {
    try {
      const disconnected = await bleService.disconnectDevice(peripheralId);
      if (disconnected && connectedDevice === peripheralId) {
        setConnectedDevice(null);
      }
      return disconnected;
    } catch (err) {
      console.error('Disconnection error:', err);
      setError('Falha ao desconectar do dispositivo');
      return false;
    }
  }, [connectedDevice]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (connectedDevice) {
        disconnectDevice(connectedDevice).catch(console.error);
      }
    };
  }, [connectedDevice, disconnectDevice]);

  return {
    isScanning,
    isInitialized,
    connectedDevice,
    error,
    initializeBle,
    checkBluetoothState,
    connectToDevice,
    disconnectDevice,
    setIsScanning,
    setError,
  };
};
