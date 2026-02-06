const { app } = require("@azure/functions");
const { generateDocuments } = require("./functions/generateDocuments");
const { listJobs } = require("./functions/listJobs");
const { updateJobStatus } = require("./functions/updateJobStatus");

app.http("listJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listJobs
});

app.http("generateDocuments", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: generateDocuments
})
app.http("updateJobStatus", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "jobs/{id}/status",
  handler: updateJobStatus
});
;
