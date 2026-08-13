let officeProjectionInstance = null;

function setOfficeProjection(projection) {
  officeProjectionInstance = projection;
}

function getOfficeProjection() {
  return officeProjectionInstance;
}

module.exports = { getOfficeProjection, setOfficeProjection };
