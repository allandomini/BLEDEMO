
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
// Note: Colors from 'react-native/Libraries/NewAppScreen' might not be needed
// if you define all colors in your stylesheet.
// import { Colors } from 'react-native/Libraries/NewAppScreen'; 
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  Peripheral,
  PeripheralInfo,
} from 'react-native-ble-manager';

// Define RootStackParamList if it's used for navigation type.
// This should ideally be in a central types file or your navigation setup.
type RootStackParamList = {
  PeripheralDetails: { peripheralData: PeripheralInfo };
  ScanDevices: undefined; // Added ScanDevices for completeness if navigating from itself or other screens
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'PeripheralDetails'>;

interface ScannedPeripheral extends Peripheral {
  rssiHistory?: { value: number; timestamp: number }[];
}

const SECONDS_TO_SCAN_FOR = 3;
const SERVICE_UUIDS: string[] = []; // Define specific service UUIDs to scan for, if needed
const ALLOW_DUPLICATES = true; // Set to true if you want to receive updates for already discovered devices (e.g., RSSI changes)

// This declaration module is fine here or in a global .d.ts file
declare module 'react-native-ble-manager' {
  interface Peripheral {
    connected?: boolean;
    connecting?: boolean;
  }
}

const ScanDevicesScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const [isScanning, setIsScanning] = useState(false);
  const [selectedPeripheralForChart, setSelectedPeripheralForChart] = useState<ScannedPeripheral | null>(null);
  const [isScanChartModalVisible, setIsScanChartModalVisible] = useState(false);
  const [peripherals, setPeripherals] = useState(
    new Map<Peripheral['id'], ScannedPeripheral>()
  );

  const startScan = () => {
    if (!isScanning) {
      setPeripherals(new Map<Peripheral['id'], ScannedPeripheral>()); // Clear previous scan results
      try {
        console.debug('[startScan] starting scan...');
        setIsScanning(true);
        BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
        })
          .then(() => {
            console.debug('[startScan] scan promise returned successfully.');
          })
          .catch((err: any) => {
            console.error('[startScan] ble scan returned in error', err);
            setIsScanning(false); // Ensure scanning state is reset on error
          });
      } catch (error) {
        console.error('[startScan] ble scan error thrown', error);
        setIsScanning(false); // Ensure scanning state is reset on error
      }
    }
  };

  // Removed startCompanionScan, enableBluetooth, retrieveServices, readCharacteristics, getAssociatedPeripherals
  // from direct UI interaction based on the mockup. The logic can remain if used internally.

  const handleStopScan = () => {
    setIsScanning(false);
    console.debug('[handleStopScan] scan is stopped.');
  };

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent
  ) => {
    console.debug(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`
    );
    setPeripherals((map) => {
      let p = map.get(event.peripheral);
      if (p) {
        p.connected = false;
        p.connecting = false; // Also reset connecting flag
        return new Map(map.set(event.peripheral, p));
      }
      return map;
    });
  };

  const handleConnectPeripheral = (event: {peripheral: string}) => { // Added type for event
    console.log(`[handleConnectPeripheral][${event.peripheral}] connected.`);
    // Update the peripheral's state in the map upon successful connection
    setPeripherals(map => {
        const p = map.get(event.peripheral);
        if(p) {
            p.connected = true;
            p.connecting = false;
            return new Map(map.set(event.peripheral, p));
        }
        return map;
    });
  };

  const handleUpdateValueForCharacteristic = (
    data: BleManagerDidUpdateValueForCharacteristicEvent
  ) => {
    console.debug(
      `[handleUpdateValueForCharacteristic] received data from '${data.peripheral}' with characteristic='${data.characteristic}' and value='${data.value}'`
    );
  };

  const MAX_SCAN_RSSI_HISTORY = 15; 

  const handleDiscoverPeripheral = (peripheral: Peripheral) => { // Use base Peripheral type from library
    console.debug('[handleDiscoverPeripheral] new BLE peripheral=', peripheral);
    if (!peripheral.name) {
      peripheral.name = 'NO NAME';
    }
    
    setPeripherals(map => {
      const existingPeripheral = map.get(peripheral.id);
      let newHistory = existingPeripheral?.rssiHistory || [];

      if (peripheral.rssi !== undefined && peripheral.rssi !== null) { 
        newHistory = [...newHistory, { value: peripheral.rssi, timestamp: Date.now() }];
        if (newHistory.length > MAX_SCAN_RSSI_HISTORY) {
          newHistory = newHistory.slice(-MAX_SCAN_RSSI_HISTORY);
        }
      }

      // Create or update the ScannedPeripheral object
      const updatedPeripheral: ScannedPeripheral = {
        ...peripheral, // Spread properties from the discovered peripheral
        id: peripheral.id, // Ensure id is explicitly set
        name: peripheral.name,
        rssi: peripheral.rssi,
        advertising: peripheral.advertising, // Keep advertising data
        rssiHistory: newHistory,
        connected: existingPeripheral?.connected || false,
        connecting: existingPeripheral?.connecting || false,
      };
      
      return new Map(map.set(peripheral.id, updatedPeripheral));
    });
  };

  const togglePeripheralConnection = async (peripheral: ScannedPeripheral) => {
    if (peripheral && peripheral.connected) {
      try {
        console.log(`[togglePeripheralConnection] Disconnecting from ${peripheral.id}`);
        await BleManager.disconnect(peripheral.id);
        // handleDisconnectedPeripheral will update the state via listener
      } catch (error) {
        console.error(
          `[togglePeripheralConnection][${peripheral.id}] error when trying to disconnect device.`,
          error
        );
      }
    } else if (peripheral && !peripheral.connecting) { // Prevent multiple connection attempts
      await connectPeripheral(peripheral);
    }
  };
  
  const connectPeripheral = async (peripheral: ScannedPeripheral) => {
    try {
      if (peripheral) {
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connecting = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        console.debug(`[connectPeripheral] Connecting to ${peripheral.id}...`);
        await BleManager.connect(peripheral.id);
        // handleConnectPeripheral listener will update connected state.
        // It's often better to let the event listener handle the final connected state update.
        console.debug(`[connectPeripheral][${peripheral.id}] Connection successful (event will confirm).`);

        await sleep(900); // Allow time for connection to establish fully

        const peripheralData = await BleManager.retrieveServices(peripheral.id);
        console.debug(
          `[connectPeripheral][${peripheral.id}] retrieved peripheral services`,
          peripheralData
        );
        
        // Update peripheral with full data including services for navigation
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            const detailedP: ScannedPeripheral = {
                ...p, 
                ...peripheralData, // Add service/characteristic info
                connecting: false, 
                connected: true // Explicitly set connected here after retrieveServices
            };
            return new Map(map.set(p.id, detailedP));
          }
          return map;
        });

        navigation.navigate('PeripheralDetails', {
          peripheralData: peripheralData, // Pass the full PeripheralInfo
        });
      }
    } catch (error) {
      console.error(
        `[connectPeripheral][${peripheral.id}] connectPeripheral error`,
        error
      );
      setPeripherals((map) => {
        let p = map.get(peripheral.id);
        if (p) {
          p.connecting = false;
          p.connected = false; // Ensure connected is false on error
          return new Map(map.set(p.id, p));
        }
        return map;
      });
    }
  };

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  useEffect(() => {
    const listeners = [
      BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
      BleManager.onStopScan(handleStopScan),
      BleManager.onConnectPeripheral(handleConnectPeripheral),
      BleManager.onDidUpdateValueForCharacteristic(
        handleUpdateValueForCharacteristic
      ),
      BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
    ];

    handleAndroidPermissions();

    return () => {
      console.debug('[ScanDevicesScreen] unmounting. Removing listeners...');
      for (const listener of listeners) {
        listener.remove();
      }
    };
  }, []);

  const handleAndroidPermissions = () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]).then((result) => {
        if (result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
            result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED) {
          console.debug(
            '[handleAndroidPermissions] User accepts runtime permissions android 12+'
          );
        } else {
          console.error(
            '[handleAndroidPermissions] User refuses runtime permissions android 12+'
          );
        }
      });
    } else if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      ).then((checkResult) => {
        if (checkResult) {
          console.debug(
            '[handleAndroidPermissions] runtime permission Android <12 already OK'
          );
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ).then((requestResult) => {
            if (requestResult === PermissionsAndroid.RESULTS.GRANTED) {
              console.debug(
                '[handleAndroidPermissions] User accepts runtime permission android <12'
              );
            } else {
              console.error(
                '[handleAndroidPermissions] User refuses runtime permission android <12'
              );
            }
          });
        }
      });
    }
  };

  const renderItem = ({ item }: { item: ScannedPeripheral }) => {
    // const backgroundColor = item.connected ? '#E6FFED' : Colors.white; // Lighter green for connected
    const borderColor = item.connected ? '#4CAF50' : '#E0E0E0';

    return (
      <TouchableHighlight
        underlayColor="#f0f0f0" // Lighter underlay color
        onPress={() => togglePeripheralConnection(item)}
        style={[styles.rowTouchable, { borderColor }]} // Apply border to TouchableHighlight for better effect
      >
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
              {/* Placeholder for actual signal icon based on RSSI value */}
              {/* For now, just showing text */}
              <Text style={styles.rssiLabel}>RSSI:</Text>
              <Text style={styles.rssiValue}>{item.rssi !== undefined ? `${item.rssi}` : 'N/A'}</Text>
            </View>
            {item.rssiHistory && item.rssiHistory.length > 1 && (
              <TouchableOpacity
                style={styles.chartButton}
                onPress={(e) => {
                  e.stopPropagation(); // Prevent TouchableHighlight onPress from firing
                  setSelectedPeripheralForChart(item);
                  setIsScanChartModalVisible(true);
                }}
              >
                <Text style={styles.chartButtonText}>OPEN RSSI CHART</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableHighlight>
    );
  };
  
  const chartWidth = Dimensions.get('window').width * 0.8; // For modal chart

  return (
    <>
      <StatusBar backgroundColor="#0069C0" barStyle="light-content" /> {/* Darker blue for status bar to match mockup */}
      <SafeAreaView style={styles.body}>
        <Text style={styles.headerTitle}>Nearby BLE Devices</Text>
        
        <Pressable 
          style={({ pressed }) => [
            styles.scanButton,
            pressed && styles.scanButtonPressed
          ]} 
          onPress={startScan}
          disabled={isScanning} // Disable button while scanning
        >
          <Text style={styles.scanButtonText}>
            {isScanning ? 'SCANNING...' : 'SCAN'}
          </Text>
        </Pressable>

        {Array.from(peripherals.values()).length === 0 && !isScanning && (
          <View style={styles.noPeripheralsContainer}>
            <Text style={styles.noPeripheralsText}>
              No peripherals found. Press "SCAN" to start.
            </Text>
          </View>
        )}

        <FlatList
          data={Array.from(peripherals.values())}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={isScanning ? 
            <View style={styles.noPeripheralsContainer}><Text style={styles.noPeripheralsText}>Scanning for devices...</Text></View> 
            : null
          }
        />

        {selectedPeripheralForChart && (
          <Modal
            animationType="slide"
            transparent={true}
            visible={isScanChartModalVisible}
            onRequestClose={() => {
              setIsScanChartModalVisible(false);
              setSelectedPeripheralForChart(null);
            }}>
            <View style={styles.modalCenteredView}>
              <View style={styles.modalView}>
                <Text style={styles.modalTitle}>RSSI Chart (Scan)</Text>
                <Text style={styles.modalText}>
                  Device: {selectedPeripheralForChart?.name || selectedPeripheralForChart?.id || 'Unknown'}
                </Text>
                <Text style={styles.modalText}>
                  Current RSSI (Last Seen): {selectedPeripheralForChart?.rssi || 'N/A'} dBm
                </Text>

                {selectedPeripheralForChart?.rssiHistory && selectedPeripheralForChart.rssiHistory.length > 1 ? (
                  <View style={styles.chartContainerModal}>
  <LineChart
                      data={selectedPeripheralForChart.rssiHistory}
                      height={220}
                      width={300}
                      
                      // Configuração do Eixo Y
                      // @ts-ignore
                      minValue={-95}      // Ajuste fino: um pouco abaixo do seu RSSI mais baixo
                      // @ts-ignore
                      maxValue={-115}      // Ajuste fino: um pouco acima do seu RSSI mais alto
                      noOfSections={6}    // Número de seções no eixo Y
                      yAxisLabelSuffix=" dBm"
                      yAxisTextStyle={{ color: 'gray', fontSize: 10 }}
                      yAxisLabelContainerStyle={{paddingRight: 5}}
                      
                      // Configuração da linha e pontos
                      color="#4CAF50"      // Verde para o gráfico de scan
                      thickness={2}
                      dataPointsColor="#4CAF50"
                      dataPointsRadius={3}
                      
                      // Eixos e grades
                      rulesColor="rgba(0,0,0,0.08)"
                      rulesType="dashed"
                      showVerticalLines
                      verticalLinesColor="rgba(0,0,0,0.08)"
                      xAxisLabelTextStyle={{ color: 'gray', fontSize: 10, textAlign: 'center' }}
                      
                      // Animações e interatividade
                      isAnimated
                      animationDuration={1000}
                      curved
                      scrollable={true}
                      scrollToEnd={true}
                      initialSpacing={10}
                      spacing={40}
                      
                      // Área do gráfico
                      areaChart={true}
                      startFillColor="rgba(76, 175, 80, 0.2)"
                      endFillColor="rgba(76, 175, 80, 0.01)"
                      
                      // Foco e interação
                      focusEnabled={true}
                      showDataPointOnFocus={true}
                      showStripOnFocus={true}
                      stripHeight={220}
                      stripColor="rgba(0,0,0,0.1)"
                      dataPointLabelShiftY={-15}
                      dataPointLabelColor="#333"
                    />
                  </View>
                ) : (
                  <Text style={styles.modalText}>Collecting more RSSI data for the chart...</Text>
                )}
                
                <TouchableOpacity
                  style={[styles.buttonModal, styles.buttonCloseModal]}
                  onPress={() => {
                    setIsScanChartModalVisible(false);
                    setSelectedPeripheralForChart(null);
                  }}>
                  <Text style={styles.textStyleButton}>Close Chart</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: '#F0F4F8', // Light grayish-blue background as per mockup
  },
  headerTitle: {
    fontSize: 22, // Slightly larger
    fontWeight: '600', // Semibold
    color: '#1A202C', // Darker text for header
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight || 20 : 20, // Adjust for status bar
    marginBottom: 15,
    textAlign: 'center',
  },
  scanButton: {
    backgroundColor: '#4FD1C5', // Teal color from mockup
    borderRadius: 25, // More rounded
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginHorizontal: 50, // Centered with more margin
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scanButtonPressed: {
    backgroundColor: '#3ABAB4', // Darker teal on press
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  listContainer: {
    paddingHorizontal: 16, // Match mockup padding
    paddingBottom: 20,
  },
  rowTouchable: { // Style for the TouchableHighlight itself
    backgroundColor: '#FFFFFF', // White background for items
    borderRadius: 12, // Rounded corners for items
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    borderWidth: 1, // Add border
    // borderColor will be set dynamically
  },
  rowContent: { // Inner View for content padding and layout
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  deviceInfo: {
    flex: 1, // Allow text to take available space
  },
  peripheralName: {
    fontSize: 17, // Larger name
    fontWeight: '600', // Semibold
    color: '#2D3748', // Darker text
    marginBottom: 4,
  },
  connectingText: {
    color: '#DD6B20', // Orange for connecting
    fontSize: 12,
    fontStyle: 'italic',
  },
  connectedText: {
    color: '#38A169', // Green for connected
    fontSize: 12,
    fontWeight: '500',
  },
  peripheralId: {
    fontSize: 11, // Smaller ID
    color: '#718096', // Lighter gray
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', // Monospace for ID
  },
  deviceStatus: {
    alignItems: 'flex-end', // Align RSSI and button to the right
  },
  rssiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rssiLabel: {
    fontSize: 12,
    color: '#A0AEC0', // Lighter gray for "RSSI:" label
    marginRight: 4,
  },
  rssiValue: {
    fontSize: 14,
    color: '#4A5568', // Darker gray for RSSI value
    fontWeight: '600',
  },
  signalIcon: { // Placeholder - replace with actual icon component
    width: 18,
    height: 14,
    marginLeft: 5,
    // backgroundColor: '#CBD5E0', // Example color
    // For a real icon, you'd use an <Image> or an icon library
  },
  chartButton: {
    borderColor: '#4FD1C5', // Teal border
    borderWidth: 1.5,
    borderRadius: 20, // Pill shape
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  chartButtonText: {
    color: '#4FD1C5', // Teal text
    fontSize: 11, // Smaller text for button
    fontWeight: 'bold',
  },
  noPeripheralsContainer: {
    flex: 1, // To center it if list is empty
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noPeripheralsText: {
    color: '#A0AEC0', // Lighter gray
    fontSize: 16,
    textAlign: 'center',
  },
  // Modal styles (mostly kept your existing, with minor color tweaks for consistency)
  modalCenteredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', // Slightly darker backdrop
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 15, // Consistent rounding
    padding: 20, // Standard padding
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
    width: '90%',
    maxHeight: '85%', // Allow a bit more height
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20, // Slightly larger
    fontWeight: '600',
    color: '#1A202C',
  },
  modalText: {
    marginBottom: 10, // Less margin for info texts
    textAlign: 'center',
    color: '#4A5568',
    fontSize: 14,
  },
  buttonModal: {
    borderRadius: 20, // Pill shape
    paddingVertical: 10,
    paddingHorizontal: 25,
    elevation: 2,
    marginTop: 15, // More space above button
  },
  buttonCloseModal: {
    backgroundColor: '#4FD1C5', // Teal close button
  },
  textStyleButton: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  chartContainerModal: { // Container for the chart inside the modal
    paddingVertical: 10, // Less vertical padding if modal padding is already good
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%', // Take full width of modal content area
    // height: 250, // Height is set on LineChart directly
    marginBottom: 10,
  },
});

export default ScanDevicesScreen;