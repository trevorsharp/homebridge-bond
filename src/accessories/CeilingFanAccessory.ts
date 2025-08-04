import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { BondPlatformConfig } from '../interface/config';
import { PlatformAccessory } from 'homebridge';
import { Device } from '../interface/Device';
import { ButtonService, FanService, LightbulbService, SwitchService } from '../Services';
import { Observer } from '../Observer';

export class CeilingFanAccessory implements BondAccessory {
  platform: BondPlatform
  accessory: PlatformAccessory
  fanService: FanService

  increaseSpeedService?: ButtonService
  decreaseSpeedService?: ButtonService

  lightService?: LightbulbService
  toggleLightService?: ButtonService
  dimmerService?: SwitchService

  upLightService?: LightbulbService
  toggleUpLightService?: ButtonService
  upLightDimmerService?: SwitchService

  downLightService?: LightbulbService
  toggleDownLightService?: ButtonService
  downLightDimmerService?: SwitchService

  increaseBrightnessService?: SwitchService
  decreaseBrightnessService?: SwitchService

  minStep: number
  maxValue: number
  values: number[]

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    const config = platform.config as BondPlatformConfig;
    this.platform = platform;
    this.accessory = accessory;

    const fanSpeedValues = config.fan_speed_values;
    const includeDimmer = config.include_dimmer;
    const includeToggle = config.include_toggle_state;
    const device: Device = accessory.context.device;

    this.values = Device.fanSpeeds(device);
    this.minStep = Math.floor(100 / this.values.length);
    this.maxValue = this.minStep * this.values.length;
    if (fanSpeedValues) {
      this.minStep = 1;
      this.maxValue = this.values.length;
    }

    this.fanService = new FanService(platform, accessory);

    this.increaseSpeedService = new ButtonService(platform, accessory, `Increase Fan Speed`, 'IncreaseSpeed');
    this.decreaseSpeedService = new ButtonService(platform, accessory, `Decrease Fan Speed`, 'DecreaseSpeed');

    if (Device.CFhasUpDownLight(device)) {
      this.upLightService = new LightbulbService(platform, accessory, `${accessory.displayName} Up Light`, 'UpLight');
      this.downLightService = new LightbulbService(platform, accessory, `${accessory.displayName} Down Light`, 'DownLight');

      if (includeToggle) {
        this.toggleUpLightService = new ButtonService(platform, accessory, 'Toggle Up Light State', 'ToggleUpLight');
        this.toggleDownLightService = new ButtonService(platform, accessory, 'Toggle Down Light State', 'ToggleDownLight');
      } else {
        // Remove services if previously added
        this.removeService('Toggle Up Light State');
        this.removeService('Toggle Down Light State');
      }

      if (includeDimmer && Device.HasDimmer(device)) {
        this.upLightDimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Up Light Dimmer`, 'UpLight');
        this.downLightDimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Down Light Dimmer`, 'DownLight');
      } else {
        // Remove services if previously added
        this.removeService(`${accessory.displayName} Up Light Dimmer`);
        this.removeService(`${accessory.displayName} Down Light Dimmer`);
      }
    } else if (Device.CFhasLightbulb(device)) {
      this.lightService = new LightbulbService(platform, accessory, `${accessory.displayName} Light`);
      if (includeToggle) {
        this.toggleLightService = new ButtonService(platform, accessory, 'Toggle Light State', 'ToggleState');
      } else {
        this.removeService('Toggle Light State');
      }

      if (includeDimmer && Device.HasDimmer(device)) {
        this.dimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Dimmer`, 'Dimmer');
      } else {
        // Remove service if previously added
        this.removeService(`${accessory.displayName} Dimmer`);
      }
    }

    if (includeDimmer && Device.HasSeparateDimmers(device)) {
      this.increaseBrightnessService = new SwitchService(platform, accessory, `${accessory.displayName} Increase Brightness`, 'IncreaseBrightness');
      this.decreaseBrightnessService = new SwitchService(platform, accessory, `${accessory.displayName} Decrease Brightness`, 'DecreaseBrightness');
    } else {
      // Remove service if previously added
      this.removeService(`${accessory.displayName} Increase Brightness`);
      this.removeService(`${accessory.displayName} Decrease Brightness`);
    }

    this.observe(bond);
  }

  updateState(state: BondState) {
    // Power
    this.fanService.on.updateValue(state.power === 1);

    // Speed
    if (this.fanService.rotationSpeed) {
      let value = 0;
      if (state.speed && state.power === 1) {
        const index = this.values.indexOf(state.speed) + 1;
        const step = index * this.minStep;
        value = step;
      }
      this.fanService.rotationSpeed.updateValue(value);
    }

    // Rotation direction
    if (this.fanService.rotationDirection) {
      let direction = 0;
      if (state.direction) {
        // Bond state direction is 1 / -1, Homekit direction is 1 / 0
        direction = state.direction === 1 ? 1 : 0;
        this.fanService.rotationDirection.updateValue(direction);
      }
    }

    // Light
    if (this.lightService) {
      this.lightService.updateState(state);
    }

    // Up Light
    if (this.upLightService) {
      this.upLightService.updateState(state);
    }

    // Down Light
    if (this.downLightService) {
      this.downLightService.updateState(state);
    }
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;
    this.observeFanPower(bond, device);
    this.observeFanSpeed(bond, device);
    this.observeFanDirection(bond, device);
    this.observeFanIncreaseSpeed();
    this.observeFanDecreaseSpeed();

    if (this.lightService) {
      this.lightService.observe(this.platform, bond, this.accessory);
    }
    this.observeLightToggle(bond, device, this.toggleLightService);
    this.observeLightDimmer(bond, device, this.dimmerService);

    if (this.upLightService) {
      this.upLightService.observe(this.platform, bond, this.accessory);
    }
    this.observeLightToggle(bond, device, this.toggleUpLightService);
    this.observeLightDimmer(bond, device, this.upLightDimmerService);

    if (this.downLightService) {
      this.downLightService.observe(this.platform, bond, this.accessory);
    }
    this.observeLightToggle(bond, device, this.toggleDownLightService);
    this.observeLightDimmer(bond, device, this.downLightDimmerService);

    this.observeLightIncreaseBrightness(bond, device, this.decreaseBrightnessService);
    this.observeLightDecreaseBrightness(bond, device, this.increaseBrightnessService);

    // Set initial state
    bond.api.getState(device.id).then(state => {
      this.updateState(state);
    });
  }

  private observeFanPower(bond: Bond, device: Device) {
    if (!Device.hasOffOn(device)) {
      this.platform.error(this.accessory, 'CeilingFanAccessory does not have required actions for fan service.');
      return;
    }

    Observer.set(this.fanService.on, (value, callback) => {
      bond.api.toggleFan(device, value, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set fan power: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting fan power: ${error}`);
        });
    });
  }

  private observeFanSpeed(bond: Bond, device: Device) {
    if (!this.fanService.rotationSpeed) {
      return;
    }

    const props = {
      maxValue: this.maxValue,
      minStep: this.minStep,
    };
    this.fanService.rotationSpeed.setProps(props);

    Observer.set(this.fanService.rotationSpeed, (step, callback) => {
      if (step === 0) {
        // Step of 0 is the same as turning the fan off. This is handled in the fan power observer
        callback(null);
        return;
      }
      const index = step as number / this.minStep - 1;
      const speed = this.values[index];

      bond.api.setFanSpeed(device, speed, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set fan speed: ${speed}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting fan speed: ${error}`);
        });
    });
  }

  private observeFanDirection(bond: Bond, device: Device) {
    if (!this.fanService.rotationDirection) {
      return;
    }

    Observer.set(this.fanService.rotationDirection, (value, callback) => {
      bond.api.toggleDirection(device, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set fan direction: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting fan direction: ${error}`);
        });
    });
  }

  private observeFanIncreaseSpeed() {
    if (!this.increaseSpeedService) {
      return;
    }

    Observer.set(this.increaseSpeedService.on, (value, callback) => {
      if (this.fanService.rotationSpeed) {
        if (this.fanService.on.value === true) {
          switch (this.fanService.rotationSpeed.value) {
            case 33:
              this.fanService.rotationSpeed.setValue(66);
              break;
            default:
              this.fanService.rotationSpeed.setValue(99);
          }
        } else {
          this.fanService.rotationSpeed.setValue(33);
        }
      }
      this.platform.log(`Increased fan speed`);
      callback();
    });
  }

  private observeFanDecreaseSpeed() {
    if (!this.decreaseSpeedService) {
      return;
    }

    Observer.set(this.decreaseSpeedService.on, (value, callback) => {
      if (this.fanService.rotationSpeed) {
        if (this.fanService.on.value === true) {
          switch (this.fanService.rotationSpeed.value) {
            case 33:
              this.fanService.on.setValue(false);
              break;
            case 66:
              this.fanService.rotationSpeed.setValue(33);
              break;
            default:
              this.fanService.rotationSpeed.setValue(66);
          }
        }
      }
      this.platform.log(`Decreased fan speed`);
      callback();
    });
  }

  private observeLightToggle(bond: Bond, device: Device, service?: ButtonService) {
    if (!service) {
      return;
    }

    Observer.set(service.on, (_, callback) => {
      let promise: Promise<void>;

      const subtype = service.subType;
      if (subtype === 'UpLight') {
        promise = bond.api.toggleState(device, 'up_light', callback);
      } else if (subtype === 'DownLight') {
        promise = bond.api.toggleState(device, 'down_light', callback);
      } else {
        promise = bond.api.toggleState(device, 'light', callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, 'Light state toggled');
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling light state: ${error}`);
        });
    });
  }

  private observeLightDimmer(bond: Bond, device: Device, service?: SwitchService) {
    if (!service) {
      return;
    }

    Observer.set(service.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        const subtype = service.subType;
        if (subtype === 'UpLight') {
          promise = bond.api.startUpLightDimmer(device, callback);
        } else if (subtype === 'DownLight') {
          promise = bond.api.startDownLightDimmer(device, callback);
        } else {
          promise = bond.api.startDimmer(device, callback);
        }
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Toggled dimmer: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling dimmer: ${error}`);
        });
    });
  }

  private observeLightIncreaseBrightness(bond: Bond, device: Device, downService?: SwitchService) {
    if (!this.increaseBrightnessService) {
      return;
    }

    Observer.set(this.increaseBrightnessService.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        if (downService) {
          bond.api.stop(device);
          downService.on.updateValue(false);
        }
        promise = bond.api.startIncreasingBrightness(device, callback);
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Increased Brightness: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error increasing brightness: ${error}`);
        });
    });
  }

  private observeLightDecreaseBrightness(bond: Bond, device: Device, upService?: SwitchService) {
    if (!this.decreaseBrightnessService) {
      return;
    }

    Observer.set(this.decreaseBrightnessService.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        if (upService) {
          bond.api.stop(device);
          upService.on.updateValue(false);
        }
        promise = bond.api.startDecreasingBrightness(device, callback);
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Decreased Brightness: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error decreasing brightness: ${error}`);
        });
    });
  }

  private removeService(serviceName: string) {
    const service = this.accessory.getService(serviceName);
    if (service) {
      this.accessory.removeService(service);
      this.platform.log(`Removing Service ${serviceName}`);
    }
  }
}