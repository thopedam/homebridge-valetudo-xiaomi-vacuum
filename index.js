const { VacuumRe } = require('./vacuumre');
const { VacuumValetudo } = require('./vacuumvaletudo');
const types = require('./types');

let Service; let Characteristic;

class ValetudoXiaomiVacuum {
  statusCallback(status) {
    this.device.getBatteryLevel((error, level) => {
      if (error) { return; }

      this.batteryService.updateCharacteristic(
        Characteristic.BatteryLevel, level,
      );

      this.batteryService.updateCharacteristic(
        Characteristic.StatusLowBattery, level < this.lowBatteryThreshold
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    });

    this.device.getChargingState((error, state) => {
      if (error) { return; }

      this.batteryService.updateCharacteristic(
        Characteristic.ChargingState,
        state === types.CHARGING_STATE.CHARGING
          ? Characteristic.ChargingState.CHARGING
          : Characteristic.ChargingState.NOT_CHARGING,
      );
    });

    this.device.isCleaning((error, state) => {
      if (error) { return; }

      this.cleanService.updateCharacteristic(Characteristic.On,
        state); // cleaning
    });

  }

  getBattery(callback) {
    this.device.getBatteryLevel((error, level) => {
      if (error) {
        callback(error);
      } else {
        callback(null, level);
      }
    });
  }

  getCharging(callback) {
    this.device.getChargingState((error, state) => {
      if (error) {
        callback(error);
      } else if (state === types.CHARGING_STATE.CHARGING) {
        callback(null, Characteristic.ChargingState.CHARGING);
      } else if (state === types.CHARGING_STATE.DISCHARGING) {
        callback(null, Characteristic.ChargingState.NOT_CHARGEABLE);
      } else {
        callback(null, Characteristic.ChargingState.NOT_CHARGING);
      }
    });
  }

  getBatteryLow(callback) {
    this.device.getBatteryLevel((error, level) => {
      if (error) {
        callback(error);
      } else if (level < this.lowBatteryThreshold) {
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
      } else {
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
      }
    });
  }

  getServices() {
    return this.services;
  }

  async getVersion(callback) {
    try {
      this.device.version(callback);
    } catch (e) {
      callback(e);
    }
  }

  async startCleaning(state, callback) {
    if (state) {
      this.log.debug('Executing cleaning');

      try {
        this.device.startCleaning((error) => {
          callback(error);
        });
      } catch (e) {
        this.log.error(`Failed to start cleaning: ${e}`);
      }
    } else {
      this.device.goHome((error) => {
        callback(error);
      });
    }
  }

  isCleaning(callback) {
    this.device.isCleaning((error, status) => {
      if (error) {
        callback(error);
        return;
      }

      callback(null, status);
    });
  }


  constructor(log, config) {
    this.services = [];
    this.log = log;
    this.name = config.name || 'Vacuum';
    this.commandClean = config.commandClean || `Clean, ${this.name}`;
    this.commandBattery = config.commandBattery || `${this.name} Battery`;
    this.lowBatteryThreshold = 10;

    const re = config['legacy-mode'] === true;

    this.device = re
      ? new VacuumRe(this.log, config, (state) => { this.statusCallback(state); })
      : new VacuumValetudo(this.log, config, (state) => { this.statusCallback(state); });

    this.serviceInfo = new Service.AccessoryInformation();
    this.serviceInfo
      .setCharacteristic(Characteristic.Manufacturer, 'Xiaomi')
      .setCharacteristic(Characteristic.Model, 'Roborock');

    this.serviceInfo.getCharacteristic(Characteristic.FirmwareRevision)
      .on('get', (callback) => { this.getVersion(callback); });
    this.services.push(this.serviceInfo);

    this.cleanService = new Service.Switch(this.commandClean, 'clean');
    this.cleanService.getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => { this.startCleaning(value, callback); })
      .on('get', (callback) => { this.isCleaning(callback); });
    this.services.push(this.cleanService);

    this.batteryService = new Service.BatteryService(this.commandBattery);
    this.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .on('get', (callback) => { this.getBattery(callback); });
    this.batteryService
      .getCharacteristic(Characteristic.ChargingState)
      .on('get', (callback) => { this.getCharging(callback); });
    this.batteryService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .on('get', (callback) => { this.getBatteryLow(callback); });
    this.services.push(this.batteryService);

    this.device.updateStatus(true);
  }
}

module.exports = (api) => {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  api.registerAccessory('homebridge-valetudo-xiaomi-vacuum', 'ValetudoXiaomiVacuum', ValetudoXiaomiVacuum);
};
