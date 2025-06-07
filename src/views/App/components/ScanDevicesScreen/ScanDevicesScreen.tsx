import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  StatusBar,
  Platform,
  PermissionsAndroid,
  FlatList,
  TouchableHighlight,
  Pressable,
  Modal,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useBle } from '../../../../hooks/useBle';
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  Peripheral,
  PeripheralInfo,
} from 'react-native-ble-manager';

type RootStackParamList = {
  PeripheralDetails: { peripheralData: PeripheralInfo };
  ScanDevices: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'PeripheralDetails'>;

interface ScannedPeripheral extends Peripheral {
  rssiHistory?: { value: number; timestamp: number }[];
}

declare module 'react-native-ble-manager' {
  interface Peripheral {
    connected?: boolean;
    connecting?: boolean;
  }
}

const SECONDS_TO_SCAN_FOR = 3;
const SERVICE_UUIDS: string[] = [];
const ALLOW_DUPLICATES = true;


const ScanDevicesScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  
  const { isScanning, setIsScanning } = useBle();

  const [selectedPeripheralForChart, setSelectedPeripheralForChart] = useState<ScannedPeripheral | null>(null);
  const [isScanChartModalVisible, setIsScanChartModalVisible] = useState(false);
  const [peripherals, setPeripherals] = useState(new Map<Peripheral['id'], ScannedPeripheral>());
  
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleStopScan = useCallback(async (fromAutoStop = false) => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (isScanning) {
      try {
        await BleManager.stopScan();
      } catch (err) {
        console.error('❌ Error stopping BLE scan:', err);
      } finally {
        setIsScanning(false);
      }
    } else {
      setIsScanning(false);
    }
  }, [isScanning, setIsScanning]);

  const startScan = useCallback(async () => {    
    if (isScanning) return;
    
    try {
      await BleManager.checkState();
      setPeripherals(new Map());
      setIsScanning(true);
      
      await BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES, {
        matchMode: BleScanMatchMode.Sticky,
        scanMode: BleScanMode.LowLatency,
        callbackType: BleScanCallbackType.AllMatches,
      });
      
      scanTimeoutRef.current = setTimeout(() => handleStopScan(true), SECONDS_TO_SCAN_FOR * 1000);
    } catch (error) {
      console.error('❌ Scan error:', error);
      setIsScanning(false);
      Alert.alert('Erro ao Escanear', String(error));
    }
  }, [isScanning, handleStopScan, setIsScanning]);

  const handleDisconnectedPeripheral = (event: BleDisconnectPeripheralEvent) => {
    setPeripherals(map => {
      const p = map.get(event.peripheral);
      if (p) {
        p.connected = false;
        p.connecting = false;
        return new Map(map.set(event.peripheral, p));
      }
      return map;
    });
  };

  const handleDiscoverPeripheral = (peripheral: Peripheral) => {
    if (!peripheral.name) peripheral.name = 'NO NAME';
    
    setPeripherals(map => {
      const existing = map.get(peripheral.id);
      let newHistory = existing?.rssiHistory || [];
      if (peripheral.rssi != null) { 
        newHistory = [...newHistory, { value: peripheral.rssi, timestamp: Date.now() }];
        if (newHistory.length > 15) newHistory = newHistory.slice(-15);
      }
      const updated: ScannedPeripheral = { ...peripheral, ...existing, rssiHistory: newHistory };
      return new Map(map.set(peripheral.id, updated));
    });
  };

  const connectPeripheral = async (peripheral: ScannedPeripheral) => {
    try {
      if (peripheral.connecting || peripheral.connected) return;

      setPeripherals(map => new Map(map.set(peripheral.id, { ...peripheral, connecting: true })));

      await BleManager.connect(peripheral.id);
      
      await new Promise(resolve => setTimeout(resolve, 900));

      const peripheralData = await BleManager.retrieveServices(peripheral.id);
      
      setPeripherals(map => new Map(map.set(peripheral.id, { ...peripheral, connecting: false, connected: true, ...peripheralData })));

      navigation.navigate('PeripheralDetails', { peripheralData });
      
    } catch (error) {
      console.error(`[connectPeripheral][${peripheral.id}] error`, error);
      setPeripherals(map => new Map(map.set(peripheral.id, { ...peripheral, connecting: false, connected: false })));
    }
  };
  
  const togglePeripheralConnection = async (peripheral: ScannedPeripheral) => {
    if (peripheral.connected) {
      await BleManager.disconnect(peripheral.id);
    } else {
      await connectPeripheral(peripheral);
    }
  };

  useEffect(() => {
    BleManager.start({ showAlert: false }).then(() => console.log('BleManager initialized'));

    const listeners = [
      BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
      BleManager.onStopScan(() => setIsScanning(false)),
      BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
    ];

    return () => {
      console.debug('[ScanDevicesScreen] unmounting, removing listeners...');
      listeners.forEach(listener => listener.remove());
    };
  }, []);

  const renderItem = ({ item }: { item: ScannedPeripheral }) => {
    const borderColor = item.connected ? '#4CAF50' : '#E0E0E0';
    return (
      <TouchableHighlight underlayColor="#f0f0f0" onPress={() => togglePeripheralConnection(item)} style={[styles.rowTouchable, { borderColor }]}>
        <View style={styles.rowContent}>
          <View style={styles.deviceInfo}>
            <Text style={styles.peripheralName}>
              {item.name || 'N/A'}
              {item.connecting && <Text style={styles.connectingText}> - Connecting...</Text>}
              {item.connected && <Text style={styles.connectedText}> - Connected</Text>}
            </Text>
            <Text style={styles.peripheralId}>{item.id}</Text>
          </View>
          <View style={styles.deviceStatus}>
            <View style={styles.rssiContainer}>
              <Text style={styles.rssiLabel}>RSSI:</Text>
              <Text style={styles.rssiValue}>{item.rssi !== undefined ? `${item.rssi}` : 'N/A'}</Text>
            </View>
            {(item.rssiHistory && item.rssiHistory.length > 1) && (
              <TouchableOpacity
                style={styles.chartButton}
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedPeripheralForChart(item);
                  setIsScanChartModalVisible(true);
                }}
              >
                <Text style={styles.chartButtonText}>RSSI CHART</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableHighlight>
    );
  };
  
  return (
    <SafeAreaView style={styles.body}>
      <StatusBar backgroundColor="#0069C0" barStyle="light-content" />
      <Text style={styles.headerTitle}>BLE Devices</Text>
      
      <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]} onPress={startScan} disabled={isScanning}>
        <Text style={styles.scanButtonText}>
          {isScanning ? 'SCANNING...' : 'SCAN'}
        </Text>
      </Pressable>

      <FlatList
        data={Array.from(peripherals.values())}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
            <View style={styles.noPeripheralsContainer}>
                <Text style={styles.noPeripheralsText}>
                    {isScanning ? "Scanning for devices..." : "No peripherals found. Press \"SCAN\" to start."}
                </Text>
            </View>
        }
      />

      {selectedPeripheralForChart && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={isScanChartModalVisible}
          onRequestClose={() => setIsScanChartModalVisible(false)}>
          <View style={styles.modalCenteredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalTitle}>RSSI Chart (Scan)</Text>
              <Text style={styles.modalText}>Device: {selectedPeripheralForChart?.name}</Text>
              <Text style={styles.modalText}>Current RSSI: {selectedPeripheralForChart?.rssi || 'N/A'} dBm</Text>

              {(selectedPeripheralForChart?.rssiHistory && selectedPeripheralForChart.rssiHistory.length > 1) ? (
                <View style={styles.chartContainerModal}>
                    <LineChart
                      data={selectedPeripheralForChart.rssiHistory.map(p => ({value: p.value}))}
                      height={220}
                      // --- CORREÇÃO FINAL DAS PROPRIEDADES DO GRÁFICO ---
                      yAxisOffset={100} // Compensa os valores negativos de RSSI
                      yAxisExtraHeight={20} // Adiciona um espaço no topo
                      // --- FIM DA CORREÇÃO ---
                      noOfSections={7}
                      yAxisTextStyle={{color: 'gray'}}
                      yAxisLabelSuffix=" dBm"
                      color="#4CAF50"
                      thickness={2}
                    />
                </View>
              ) : (
                <Text style={styles.modalText}>Collecting more RSSI data...</Text>
              )}
              
              <TouchableOpacity
                style={[styles.buttonModal, styles.buttonCloseModal]}
                onPress={() => setIsScanChartModalVisible(false)}>
                <Text style={styles.textStyleButton}>Close Chart</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: '#F0F4F8' },
  headerTitle: { fontSize: 22, fontWeight: '600', color: '#1A202C', marginTop: Platform.OS === 'android' ? StatusBar.currentHeight || 20 : 20, marginBottom: 15, textAlign: 'center' },
  scanButton: { backgroundColor: '#4FD1C5', borderRadius: 25, paddingVertical: 12, paddingHorizontal: 30, marginHorizontal: 50, marginBottom: 20, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  scanButtonPressed: { backgroundColor: '#3ABAB4' },
  scanButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  listContainer: { paddingHorizontal: 16, paddingBottom: 20 },
  rowTouchable: { backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, borderWidth: 1 },
  rowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  deviceInfo: { flex: 1 },
  peripheralName: { fontSize: 17, fontWeight: '600', color: '#2D3748', marginBottom: 4 },
  connectingText: { color: '#DD6B20', fontSize: 12, fontStyle: 'italic' },
  connectedText: { color: '#38A169', fontSize: 12, fontWeight: '500' },
  peripheralId: { fontSize: 11, color: '#718096', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  deviceStatus: { alignItems: 'flex-end' },
  rssiContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rssiLabel: { fontSize: 12, color: '#A0AEC0', marginRight: 4 },
  rssiValue: { fontSize: 14, color: '#4A5568', fontWeight: '600' },
  chartButton: { borderColor: '#4FD1C5', borderWidth: 1.5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, marginTop: 4 },
  chartButtonText: { color: '#4FD1C5', fontSize: 11, fontWeight: 'bold' },
  noPeripheralsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  noPeripheralsText: { color: '#A0AEC0', fontSize: 16, textAlign: 'center' },
  modalCenteredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalView: { margin: 20, backgroundColor: 'white', borderRadius: 15, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10, width: '90%', maxHeight: '85%' },
  modalTitle: { marginBottom: 15, textAlign: 'center', fontSize: 20, fontWeight: '600', color: '#1A202C' },
  modalText: { marginBottom: 10, textAlign: 'center', color: '#4A5568', fontSize: 14 },
  buttonModal: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 25, elevation: 2, marginTop: 15 },
  buttonCloseModal: { backgroundColor: '#4FD1C5' },
  textStyleButton: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 16 },
  chartContainerModal: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 10 },
});

export default ScanDevicesScreen;