function PresenceFromFile(id, controller) {
    PresenceFromFile.super_.call(this, id, controller);

    this.path = "";
    this.devicesByPresenceKey = {};
    this.devices = [];

    this.subPollsInSeconds = [0, 10000, 20000, 30000, 40000, 50000];
}

inherits(PresenceFromFile, AutomationModule);
_module = PresenceFromFile;

PresenceFromFile.prototype.init = function (config) {
    PresenceFromFile.super_.prototype.init.call(this, config);

    var self = this;

    this.path = config.path;

    config.mappings.forEach(function (mapping) {
        var userByKey = mapping.split("=");

        if (userByKey.length === 2) {
            // valid input
            var presenceKey = userByKey[0].trim();
            var person = userByKey[1].trim();

            if (!!!self.devicesByPresenceKey[presenceKey]) {
                var vDev = this.controller.devices.create({
                    deviceId: "PresenceDevice_" + self.id + "_" + presenceKey.replace(/:/g, "_"),
                    overlay: {
                        deviceType: "sensorBinary",
                    },
                    defaults: {
                        metrics: {
                            title: "Presence of " + person,
                            level: "off",
                            presenceKey: presenceKey
                        }
                    }
                });

                self.devicesByPresenceKey[presenceKey] = vDev;
                self.devices.push(vDev);
            }
        } else {
            debugPrint("Invalid mapping " + mapping);
        }
    });

    this.controller.emit("cron.addTask", "presenceFromFile.poll", {
        minute: [0, 59, 1],
        hour: null,
        weekDay: null,
        day: null,
        month: null
    });

    this.onPoll = function () {
        var presentPrecenceKeys = fs.load(self.path).split("\n");

        self.devices.forEach(function (device) {
            var presenceKey = device.get("metrics:presenceKey");

            var levelSetToOn = false;
            for (var i in presentPrecenceKeys) {
                if (presentPrecenceKeys[i] === presenceKey) {
                    // device is present
                    levelSetToOn = true;
                    break;
                }
            }

            device.set("metrics:level", levelSetToOn ? "on" : "off");
        });
    };

    this.setupPollsForOneMinute = function () {
        self.subPollsInSeconds.forEach(function (pollIn) {
            window.setTimeout(self.onPoll, pollIn);
        });
    };

    this.setupPollsForOneMinute();
    this.controller.on("presenceFromFile.poll", this.setupPollsForOneMinute);
};

PresenceFromFile.prototype.stop = function () {
    PresenceFromFile.super_.prototype.stop.call(this);

    for (var id in this.devicesByPresenceKey) {
        this.controller.devices.remove(this.mappings[id].get("id"));
    }
    
    this.devicesByPresenceKey = {};
    this.devices = [];
};
