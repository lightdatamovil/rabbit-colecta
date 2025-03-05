import { executeQuery, getProdDbConfig } from "../db.js";
import { handleFlexLogic } from "./colectaController/handlers/handleFlex.js";
import { handleExternalNoFlex, handleLocalNoFlex } from "./colectaController/handlers/handleNoFlex.js";
import mysql from "mysql";

export async function colectar(company, dataQr, userId, profile, autoAssign) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        let Amiscuentas = await obtenerMisCuentas(dbConnection, company.did);

        let response;

        const isFlex = dataQr.hasOwnProperty("sender_id");

        console.log("0");
        console.log(dataQr);
        console.log(company.did);
        console.log(dataQr.empresa);
        if (isFlex) {
            response = await handleFlexLogic(dbConnection, dataQr, company.did, Amiscuentas, userId, autoAssign);
        } else {
            if (company.did == dataQr.empresa) {
                response = await handleLocalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);
            } else {
                console.log("1");

                response = await handleExternalNoFlex(dataQr, company.did, userId, profile, autoAssign);
            }
        }

        return response;
    } catch (error) {
        console.error("Error en colectar:", error);
        throw error;
    }
}

async function obtenerMisCuentas(dbConnection, companyId) {
    try {
        const querySelectClientesCuentas = `
        SELECT did, didCliente, ML_id_vendedor 
        FROM clientes_cuentas 
        WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1
    `;

        const result = await executeQuery(dbConnection, querySelectClientesCuentas);

        let accountList = {};

        result.forEach(row => {
            accountList[companyId] = {
                didcliente: row.didCliente,
                didcuenta: row.did
            };
        });

        return accountList;
    } catch (error) {
        console.error("Error en obtenerMisCuentas:", error);
        throw error;
    }

}