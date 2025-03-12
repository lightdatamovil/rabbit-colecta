import { getAccountBySenderId, getProdDbConfig } from "../db.js";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import mysql from "mysql";
import { logRed } from "../src/funciones/logsCustom.js";

export async function colectar(company, dataQr, userId, profile, autoAssign) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        let response;

        /// Me fijo si es flex o no
        const isFlex = dataQr.hasOwnProperty("sender_id");

        /// Si es flex
        if (isFlex) {

            /// Busco la cuenta del cliente
            const account = await getAccountBySenderId(dbConnection, company.did, dataQr.sender_id);

            /// Si la cuenta existe, es interno
            if (account) {
                response = await handleInternalFlex(dbConnection, company.did, userId, profile, dataQr, autoAssign, account);

                /// Si la cuenta no existe, es externo
            } else {
                response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign);
            }
            /// Si no es flex
        } else {
            /// Si la empresa del QR es la misma que la empresa del usuario, es interno
            if (company.did == dataQr.empresa) {
                response = await handleInternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);

                /// Si la empresa del QR es distinta a la empresa del usuario, es externo
            } else {
                response = await handleExternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);
            }
        }

        return response;
    } catch (error) {
        logRed("Error en colectar:", error);
        throw error;
    } finally {
        dbConnection.end();
    }
}
