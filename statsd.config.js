{
  graphitePort: 2003,
  graphiteHost: "victoriametrics",
  backends: ["./backends/graphite"],
  deleteGauges: true,
  graphite: {
    legacyNamespace: false
  }
}
