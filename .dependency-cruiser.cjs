module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "runtime-does-not-import-fixtures",
      comment: "The native plugin runtime cannot depend on its offline test harness.",
      severity: "error",
      from: { path: "^plugins/bb-plugin-exosurface/(src/|legacy/|host\\.ts$|server\\.ts$|app\\.tsx$)" },
      to: { path: "^plugins/bb-plugin-exosurface/test/" },
    },
  ],
  options: {
    tsConfig: { fileName: require("node:path").resolve(__dirname, "plugins/bb-plugin-exosurface/tsconfig.json") },
    doNotFollow: { path: "node_modules" },
  },
};
