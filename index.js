function PresenceFromFile(id, controller) {
    PresenceFromFile.super_.call(this, id, controller);

    this.path = "";
    this.devicesByPresenceKey = {};
    this.devices = [];
    this.presenceCountDevice = null;
    this.absentTimeoutsForToken = {};

    this.subPollsInSeconds = [0, 10000, 20000, 30000, 40000, 50000];
}

inherits(PresenceFromFile, AutomationModule);
_module = PresenceFromFile;

PresenceFromFile.prototype.init = function (config) {
    PresenceFromFile.super_.prototype.init.call(this, config);

    var path = config.path;
    var absentTimeoutMillis = config.absentTimeout * 1000;


    config.tokens.forEach(_.bind(function (token) {
        if (!!!this.devicesByPresenceKey[token]) {
            var vDev = this.controller.devices.create({
                deviceId: "PresenceDevice_" + this.id + "_" + token.replace(/:/g, "_"),
                overlay: {
                    deviceType: "sensorBinary",
                },
                defaults: {
                    metrics: {
                        title: token,
                        level: "off",
                        token: token
                    }
                },
                moduleId: this.id
            });

            this.devicesByPresenceKey[token] = vDev;
            this.devices.push(vDev);
        }
    }, this));

    this.presenceCountDevice = this.controller.devices.create({
        deviceId: "PresenceDevice_" + this.id + "_Count",
        overlay: {
            deviceType: "sensorMultilevel",
        },
        defaults: {
            metrics: {
                title: "Presence Count",
                level: 0
            }
        },
        moduleId: this.id
    });

    this.controller.emit("cron.addTask", "presenceFromFile.poll", {
        minute: [0, 59, 1],
        hour: null,
        weekDay: null,
        day: null,
        month: null
    });

    this.onPoll = _.bind(function () {
        var presentPrecenceKeys = fs.load(path).split("\n");

        this.devices.forEach(_.bind(function (device) {
            var presenceKey = device.get("metrics:token");

            var levelSetToOn = false;
            for (var i in presentPrecenceKeys) {
                if (presentPrecenceKeys[i] === presenceKey) {
                    // device is present
                    levelSetToOn = true;
                    break;
                }
            }

            var metricsLevelToSet = levelSetToOn ? "on" : "off";

            if (metricsLevelToSet === "on") {
                // kill existent absent timeout in any case
                if (this.absentTimeoutsForToken[presenceKey] !== undefined) {
                    window.clearTimeout(this.absentTimeoutsForToken[presenceKey]);
                    this.absentTimeoutsForToken[presenceKey] = undefined;
                }
            }

            if (device.get("metrics:level") !== metricsLevelToSet) {
                if (metricsLevelToSet === "off") {
                    // set "off" in a couple of seconds and save timeout handle if not defined yet

                    if (this.absentTimeoutsForToken[presenceKey] === undefined) {
                        // no timeout running so far..., create a new one
                        this.absentTimeoutsForToken[presenceKey] = window.setTimeout(_.bind(function () {
                            // update device status
                            this.setIsPresent(device, levelSetToOn);

                            // update presence count status
                            this.setPresenceCount();

                        }, this), absentTimeoutMillis);
                    }
                } else {
                    this.setIsPresent(device, levelSetToOn);
                }
            }
        }, this));

        this.setPresenceCount();
    }, this);

    this.setupPollsForOneMinute = _.bind(function () {

        this.subPollsInSeconds.forEach(_.bind(function (pollIn) {
            window.setTimeout(this.onPoll, pollIn);
        }, this));

    }, this);

    this.controller.on("presenceFromFile.poll", this.setupPollsForOneMinute);
};

PresenceFromFile.prototype.setIsPresent = function(device, isPresent) {
    device.set("metrics:level", isPresent ? "on" : "off");
    device.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/PresenceFromFile/" + isPresent ? "on.png" : "off.png");
};

PresenceFromFile.prototype.setPresenceCount = function () {
    var presenceCount = 0;
    this.devices.forEach(function (dev) {
        presenceCount += (dev.get("metrics:level") === "on") ? 1 : 0;
    });

    if (this.presenceCountDevice.get("metrics:level") !== presenceCount) {
        this.presenceCountDevice.set("metrics:level", presenceCount);
    }
};

PresenceFromFile.prototype.stop = function () {
    PresenceFromFile.super_.prototype.stop.call(this);

    // unsubscribe events and stop poll
    this.controller.off("presenceFromFile.poll", this.setupPollsForOneMinute);
    this.controller.emit("cron.removeTask", "presenceFromFile.poll");

    // remove created devices
    this.devices.forEach(_.bind(function (vDev) {
        this.controller.devices.remove(vDev.get("id"));
    }, this))
    this.controller.devices.remove(this.presenceCountDevice.get("id"));

    // unsubscribe running timeouts
    for (key in this.absentTimeoutsForToken) {
        if (this.absentTimeoutsForToken[key] !== undefined) {
            window.clearTimeout(this.absentTimeoutsForToken[key]);
        }
    }
};
