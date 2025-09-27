const {createDefaultPreset} = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
    roots: ["<rootDir>/__tests__"],
    testMatch: ["**/?(*.)+(spec|test).ts"],
    testEnvironment: "node",
    transform: {
        ...tsJestTransformCfg,
    },
};
