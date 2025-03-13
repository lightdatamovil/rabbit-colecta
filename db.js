import redis from 'redis';
import dotenv from 'dotenv';
import mysql from 'mysql';
import { logRed } from './src/funciones/logsCustom.js';

dotenv.config({ path: process.env.ENV_FILE || ".env" });

const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD;

export const redisClient = redis.createClient({
    socket: {
        host: redisHost,
        port: redisPort,
    },
    password: redisPassword,
});

redisClient.on('error', (err) => {
    logRed(`Error al conectar con Redis: ${error.message}`);
});

let companiesList = {};
let clientList = {};
let accountList = {};
let driverList = {};

export function getProdDbConfig(company) {
    return {
        host: "bhsmysql1.lightdata.com.ar",
        user: company.dbuser,
        password: company.dbpass,
        database: company.dbname
    };
}

async function loadCompaniesFromRedis() {
    try {
        const companiesListString = await redisClient.get('empresasData');

        companiesList = JSON.parse(companiesListString);

    } catch (error) {
        logRed(`Error en loadCompaniesFromRedis: ${error.message}`);
        throw error;
    }
}

export async function getCompanyById(companyId) {
    try {
        let company = companiesList[companyId];

        if (company == undefined || Object.keys(companiesList).length === 0) {
            try {
                await loadCompaniesFromRedis();

                company = companiesList[companyId];
            } catch (error) {
                logRed(`Error al cargar compañías desde Redis: ${error.message}`);
                throw error;
            }
        }

        return company;
    } catch (error) {
        logRed(`Error en getCompanyById: ${error.message}`);
        throw error;
    }
}

export async function getCompanyByCode(companyCode) {
    try {
        let company;

        if (Object.keys(companiesList).length === 0) {
            try {
                await loadCompaniesFromRedis();
            } catch (error) {
                logRed(`Error al cargar compañías desde Redis: ${error.message}`);
                throw error;
            }
        }

        for (const key in companiesList) {
            if (companiesList.hasOwnProperty(key)) {
                const currentCompany = companiesList[key];
                if (String(currentCompany.codigo) === String(companyCode)) {
                    company = currentCompany;
                    break;
                }
            }
        }

        return company;
    } catch (error) {
        logRed(`Error en getCompanyByCode: ${error.message}`);
        throw error;
    }
}

async function loadAccountList(dbConnection, companyId, senderId) {
    try {
        const querySelectClientesCuentas = `
            SELECT did, didCliente, ML_id_vendedor 
            FROM clientes_cuentas 
            WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor != ''
        `;

        const result = await executeQuery(dbConnection, querySelectClientesCuentas);

        if (!accountList[companyId]) {
            accountList[companyId] = {};
        }

        result.forEach(row => {
            const keySender = row.ML_id_vendedor;

            if (!accountList[companyId][keySender]) {
                accountList[companyId][keySender] = {};
            }

            accountList[companyId][keySender] = {
                didCliente: row.didCliente,
                didCuenta: row.did,
            };
        });

        return accountList[companyId] ? accountList[companyId][senderId] : null;
    } catch (error) {
        logRed(`Error en obtenerMisCuentas: ${error.message}`);
        throw error;
    }
}

export async function getAccountBySenderId(dbConnection, companyId, senderId) {
    try {
        if (accountList === undefined || accountList === null || Object.keys(accountList).length === 0 || !accountList[companyId]) {
            await loadAccountList(dbConnection, companyId, senderId);
        }

        const account = accountList[companyId][senderId];

        return account;
    } catch (error) {
        logRed(`Error en getAccountBySenderId: ${error.message}`);
        throw error;
    }
}

async function loadClients(dbConnection, companyId) {
    if (!clientList[companyId]) {
        clientList[companyId] = {}
    }

    try {
        const queryUsers = "SELECT * FROM clientes";
        const resultQueryUsers = await executeQuery(dbConnection, queryUsers, []);

        resultQueryUsers.forEach(row => {
            const client = row.did;

            if (!clientList[companyId][client]) {
                clientList[companyId][client] = {};
            }

            clientList[companyId][client] = {
                fecha_sincronizacion: row.fecha_sincronizacion,
                did: row.did,
                codigo: row.codigoVinculacionLogE,
                nombre: row.nombre_fantasia,
            };
        });
    } catch (error) {
        logRed(`Error en loadClients para la compañía ${companyId}: ${error.message}`);
        throw error;
    }
}

export async function getClientsByCompany(dbConnection, companyId) {
    try {
        let companyClients = clientList[companyId];

        if (companyClients == undefined || Object.keys(clientList).length === 0) {
            try {
                await loadClients(dbConnection, companyId);

                companyClients = clientList[companyId];
            } catch (error) {
                logRed(`Error al cargar compañías desde Redis: ${error.message}`);
                throw companyClients;
            }
        }

        return companyClients;
    } catch (error) {
        logRed(`Error en getClientsByCompany: ${error.message}`);
        throw error;
    }
}

async function loadDrivers(dbConnection, companyId) {
    if (!driverList[companyId]) {
        driverList[companyId] = {}
    }

    try {
        const queryUsers = `
            SELECT sistema_usuarios.did, sistema_usuarios.usuario 
            FROM sistema_usuarios_accesos
            INNER JOIN sistema_usuarios ON sistema_usuarios_accesos.did = sistema_usuarios.did
            WHERE sistema_usuarios_accesos.perfil IN (3, 6)
            AND sistema_usuarios_accesos.elim = 0
            AND sistema_usuarios_accesos.superado = 0
            AND sistema_usuarios.elim = 0
            AND sistema_usuarios.superado = 0
        `;

        const resultQueryUsers = await executeQuery(dbConnection, queryUsers, []);

        for (let i = 0; i < resultQueryUsers.length; i++) {
            const row = resultQueryUsers[i];

            if (!driverList[companyId][row.did]) {
                driverList[companyId][row.did] = {};
            }

            driverList[companyId][row.did] = {
                id: row.id,
                id_origen: row.id_origen,
                fecha_sincronizacion: row.fecha_sincronizacion,
                did: row.did,
                codigo: row.codigo_empleado,
                nombre: row.usuario,
            };
        }
    } catch (error) {
        logRed(`Error en loadDrivers para la compañía ${companyId}: ${error.message}`);
        throw error;
    }
}

export async function getDriversByCompany(dbConnection, companyId) {
    try {
        let companyDrivers = driverList[companyId];

        if (companyDrivers == undefined || Object.keys(driverList).length === 0) {
            try {
                await loadDrivers(dbConnection, companyId);

                companyDrivers = driverList[companyId];
            } catch (error) {
                logRed(`Error al cargar compañías desde Redis: ${error.message}`);
                throw companyDrivers;
            }
        }

        return companyDrivers;
    } catch (error) {
        logRed(`Error en getDriversByCompany para la compañía ${companyId}: ${error.message}`);
        throw error;
    }
}
export async function executeQuery(connection, query, values) {
    try {
        return new Promise((resolve, reject) => {
            connection.query(query, values, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    } catch (error) {
        logRed(`Error en executeQuery: ${error.message}`);
        throw error;
    }
}