import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Button, NativeEventEmitter, NativeModules, Modal, TouchableOpacity, Dimensions, Platform, Animated, Easing } from 'react-native';
// Using a simple text icon for now, you can replace with an SVG or image library
// import { BarChartIcon } from './your-icon-library'; // Example if you have one
import { Buffer } from 'buffer';
import BleManager, { 
  BleManagerDidUpdateValueForCharacteristicEvent, 
  PeripheralInfo
} from 'react-native-ble-manager';
import { LineChart } from 'react-native-gifted-charts';
import HeatmapChart from './HeatmapChart';

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

// Battery Icon Component
const BatteryIcon = ({ level = 'N/A' }) => {
  if (level === 'N/A') return <Text>🔋</Text>;
  
  const batteryLevel = parseInt(level);
  let batteryColor = '#4CD964'; // Green
  
  if (batteryLevel <= 20) batteryColor = '#FF3B30'; // Red
  else if (batteryLevel <= 50) batteryColor = '#FFCC00'; // Yellow
  
  const fillWidth = Math.min(20, Math.max(2, (20 * batteryLevel) / 100));
  
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
  const isMac = peripheralData.name?.includes('Mac') || false;
  const isJBL = peripheralData.name?.includes('JBL') || false;
  // Mibro Watch might also be an LT716 variant or have similar NUS.
  // For simplicity, we'll primarily focus on LT716 for NUS example.
  const isLT716 = peripheralData.name?.includes('LT716') ||
                  peripheralData.id.toUpperCase() === 'A12DB600-4029-B3B1-3A67-398C7EE0E037' || // Example ID
                  !!peripheralData.services?.find(s => s.uuid.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase());


  const [serviceToWrite, setServiceToWrite] = useState<string>(''); // Service UUID for writing
  const [charToWrite, setCharToWrite] = useState<string>(''); // Characteristic UUID for writing
  // No need for service/characteristic notification states if we derive them or use constants

  const scrollViewRef = useRef<ScrollView>(null);
  const notificationsScrollViewRef = useRef<ScrollView>(null);


  // Effect for device-specific UUID setup (primarily for writing)
  useEffect(() => {
    if (!peripheralId) return;
    setIsLoading(false); // Moved here, as basic info is already available

    if (isLT716) {
      // Device identified as LT716. Setting NUS UUIDs for writing.
      setServiceToWrite(LT716_NUS_SERVICE_UUID);
      setCharToWrite(LT716_NUS_CHAR_RX_UUID);
    } else if (isMac) {
      // Example for Mac - actual writable chars might vary or be restricted
      // Device identified as Mac.
      // setServiceToWrite('d0611e78-bbb4-4591-a5f8-487910ae4366'); // Example
      // setCharToWrite('8667556c-9a37-4c91-84ed-54ee27d90049'); // Example
    }
    // Add other device types if needed

    return () => {
      setServiceToWrite('');
      setCharToWrite('');
    };
  }, [peripheralId, isLT716, isMac]);

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
  }, [peripheralId, isLT716, peripheralData]); // Dependências importantes


  // RSSI Polling Effect
 useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
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

  // Notification handling effect with timing test
  useEffect(() => {
    let isMounted = true;
    let notificationListener: ReturnType<NativeEventEmitter['addListener']> | null = null;

    // Starting notification effect for peripheral

    if (!peripheralId) {
      // Peripheral ID is null, skipping notification setup
      return () => {};
    }

    const setupListenersWithDelay = () => {
      if (!isMounted) return;

      let localBleEmitter: NativeEventEmitter | null = null;

      // Create NativeEventEmitter with NativeModules.BleManager
      if (NativeModules.BleManager) {
        localBleEmitter = new NativeEventEmitter(NativeModules.BleManager);
      } else {
        //
        // console.error('CRITICAL: BleManager module not available after delay');
        return;
      }

      const onCharacteristicChangedHandler = (event: BleManagerDidUpdateValueForCharacteristicEvent) => {
        const { peripheral, characteristic, service, value } = event;
        if (!isMounted || peripheral !== peripheralId) {
          return;
        }

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let message = `[${timestamp}] S:${service?.slice(-4)} C:${characteristic?.slice(-4)} - `;

        if (isLT716 && service?.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase() &&
            characteristic?.toUpperCase() === LT716_NUS_CHAR_TX_UUID.toUpperCase()) {
          try {
            message += `NUS ECO: "${Buffer.from(value).toString('utf8')}"`;
          } catch (e) {
            const rawValue = Array.isArray(value) ? value.join(',') : String(value);
            message += `NUS ECO (raw): ${rawValue}`;
          }
        } else if (service?.toUpperCase() === BATTERY_SERVICE.toUpperCase() && characteristic?.toUpperCase() === BATTERY_LEVEL_CHAR.toUpperCase()){
          const batteryLevel = value[0];
          message += `Battery Level: ${batteryLevel}%`;
          setDeviceInfo(prev => ({ ...prev, batteryLevel: String(batteryLevel) }));
        } else {
          try {
            const decodedValue = Buffer.from(value).toString('utf8');
            message += `Data: "${decodedValue}" (Hex: ${Buffer.from(value).toString('hex')})`;
          } catch (e) {
            const rawValue = Array.isArray(value) ? value.join(', ') : String(value);
            message += `Raw: ${rawValue}`;
          }
        }
        // Notification received
        setNotificationLog(prevLog => `${message}\n${prevLog}`.slice(0, 2000));
      };

      if (localBleEmitter) {
        // Registering BleManagerDidUpdateValueForCharacteristic listener
        notificationListener = localBleEmitter.addListener(
          'BleManagerDidUpdateValueForCharacteristic',
          onCharacteristicChangedHandler
        );
        // Listener registered successfully
      } else {
        // Failed to register listener: localBleEmitter is null
        return;
      }

      const startDeviceNotifications = async () => {
        if (!isMounted) return;
        if (!peripheralData?.services || peripheralData.services.length === 0) {
          // peripheralData.services is empty. Cannot start notifications.
          return;
        }

        // Starting notifications for characteristics...

        // Notificação de Bateria
        const batteryServiceInfo = peripheralData.services.find(s => s.uuid.toUpperCase() === BATTERY_SERVICE.toUpperCase());
        if (batteryServiceInfo) {
          const batteryCharInfo = peripheralData.characteristics?.find(c => c.service.toUpperCase() === BATTERY_SERVICE.toUpperCase() && c.characteristic.toUpperCase() === BATTERY_LEVEL_CHAR.toUpperCase());
          if (batteryCharInfo && (batteryCharInfo.properties.Notify || batteryCharInfo.properties.Indicate)) {
            try {
              await BleManager.startNotification(peripheralId, BATTERY_SERVICE, BATTERY_LEVEL_CHAR);
              // Battery notifications started
            } catch (error) {
              // Failed to start battery notifications
            }
          } else {
            // Battery characteristic not notifiable or not found
          }
        }

        // Notificação NUS para LT716
        if (isLT716) {
          const nusServiceInfo = peripheralData.services.find(s => s.uuid.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase());
          if (nusServiceInfo) {
            const nusTxCharInfo = peripheralData.characteristics?.find(c => c.service.toUpperCase() === LT716_NUS_SERVICE_UUID.toUpperCase() && c.characteristic.toUpperCase() === LT716_NUS_CHAR_TX_UUID.toUpperCase());
            if (nusTxCharInfo && (nusTxCharInfo.properties.Notify || nusTxCharInfo.properties.Indicate)) {
              try {
                await BleManager.startNotification(peripheralId, LT716_NUS_SERVICE_UUID, LT716_NUS_CHAR_TX_UUID);
                // LT716 NUS TX notifications started
              } catch (error) {
                // Failed to start LT716 NUS TX notifications
              }
            } else {
              // LT716 NUS TX characteristic not notifiable or not found
            }
          } else {
              // LT716 NUS service not found
          }
        }
      };

      startDeviceNotifications();
    };

    // Add a small delay to give the native module time to initialize
    const timerId = setTimeout(setupListenersWithDelay, 300); // 300ms delay

    return () => {
      isMounted = false;
      clearTimeout(timerId);
      if (notificationListener) {
        notificationListener.remove();
      }
    };
  }, [peripheralId, isLT716, peripheralData]);

  // Function to write data
  const handleWriteData = async () => {
    if (!peripheralId || !serviceToWrite || !charToWrite) {
      setReadData('Error: Device or characteristic not ready for writing.');
      // Missing peripheralId, service, or characteristic UUID for writing
      return;
    }
    if (!textToWrite.trim()) {
      setReadData('Error: No data to send.');
      return;
    }

    try {
      const dataBytes = Array.from(Buffer.from(textToWrite, 'utf8'));
      // Writing data to characteristic
      setReadData(`Sending: "${textToWrite}"...`);
      await BleManager.write(peripheralId, serviceToWrite, charToWrite, dataBytes);
      setReadData(`Successfully sent: "${textToWrite}"`);
      setTextToWrite(''); // Clear input after successful write
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // Error writing data
      setReadData(`Write Error: ${errMsg}`);
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

      {/* Services Card - Simplified */}
       <View style={styles.card}>
        <Text style={styles.cardTitle}>Services & Characteristics</Text>
        {peripheralData.services && peripheralData.services.length > 0 ? (
            peripheralData.services.map(service => renderServiceItem(service, peripheralData))
        ) : (
            <Text style={styles.infoValue}>No services discovered or reported by peripheral.</Text>
        )}
      </View>


      {/* Write Interaction Card */}
      {(isLT716 || serviceToWrite) && ( // Show if LT716 or if any writable service is configured
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Write to Characteristic</Text>
          {serviceToWrite && charToWrite ? (
            <>
              <Text style={styles.inputLabel}>Service: {serviceToWrite.slice(0,8)}... Char: {charToWrite.slice(0,8)}... (NUS RX for LT716)</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="Type data to write (UTF-8)"
                value={textToWrite}
                onChangeText={setTextToWrite}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.styledButton} onPress={handleWriteData}>
                <Text style={styles.styledButtonText}>Write</Text>
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
});

export default PeripheralDetailsScreen;
