import { getAccountBySenderId, getProdDbConfig } from "../db.js";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import mysql from "mysql";

export async function colectar(company, dataQr, userId, profile, autoAssign) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        let response;

        const isFlex = dataQr.hasOwnProperty("sender_id");

        if (isFlex) {
            const account = await getAccountBySenderId(dbConnection, company.did, dataQr.sender_id);

            if (account) {
                response = await handleInternalFlex(dbConnection, company.did, userId, profile, dataQr, autoAssign, account);
            } else {

                response = await handleExternalFlex(dbConnection, company.did, userId, profile, dataQr, autoAssign);
            }
        } else {
            if (company.did == dataQr.empresa) {
                response = await handleInternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);
            } else {
                response = await handleExternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);
            }
        }

        return response;
    } catch (error) {
        console.error("Error en colectar:", error);
        throw error;
    }
}
