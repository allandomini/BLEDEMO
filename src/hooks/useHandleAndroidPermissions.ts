import { useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

export const useHandleAndroidPermissions = () => {
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 31) { // Android 12+
          const permissions = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          if (
            permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] !== PermissionsAndroid.RESULTS.GRANTED ||
            permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] !== PermissionsAndroid.RESULTS.GRANTED ||
            permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED
          ) {
            Alert.alert("Permission Denied", "Bluetooth and Location permissions are required.");
          }
        } else if (Platform.Version >= 23) { // Android 6-11
          const checkResult = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (!checkResult) {
            const requestResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            if (requestResult !== PermissionsAndroid.RESULTS.GRANTED) {
              console.error('[useHandleAndroidPermissions] Location permission denied (API <31)');
              Alert.alert("Permission Denied", "Location permission is required for BLE scanning.");
            }
          }
        }
      }
    };

    requestPermissions();
  }, []);
};
