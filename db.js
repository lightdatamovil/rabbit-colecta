import redis from 'redis';
import dotenv from 'dotenv';
import { logRed, logYellow } from './src/funciones/logsCustom.js';

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
    logRed(`Error al conectar con Redis: ${error.stack}`);
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
export function getLocalDbConfig() {
    return {
        // host: "localhost",
        host: "149.56.182.49",
        user: "ulogs",
        password: "logs123456*",
        database: "data",
        port: 44343
    };
}
export async function updateRedis(empresaId, envioId, choferId) {
    const DWRTE = await redisClient.get('DWRTE',);
    const empresaKey = `e.${empresaId}`;
    const envioKey = `en.${envioId}`;

    // Si la empresa no existe, la creamos
    if (!DWRTE[empresaKey]) {
        DWRTE[empresaKey] = {};
    }

    // Solo agrega si el envío no existe
    if (!DWRTE[empresaKey][envioKey]) {
        DWRTE[empresaKey][envioKey] = {
            choferId: choferId
        };
    }

    await redisClient.set('DWRTE', JSON.stringify(DWRTE));
}

async function loadCompaniesFromRedis() {
    try {
        const companiesListString = await redisClient.get('empresasData');

        companiesList = JSON.parse(companiesListString);

    } catch (error) {
        logRed(`Error en loadCompaniesFromRedis: ${error.stack}`);
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
                logRed(`Error al cargar compañías desde Redis: ${error.stack}`);
                throw error;
            }
        }

        return company;
    } catch (error) {
        logRed(`Error en getCompanyById: ${error.stack}`);
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
                logRed(`Error al cargar compañías desde Redis: ${error.stack}`);
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
        logRed(`Error en getCompanyByCode: ${error.stack}`);
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
        logRed(`Error en obtenerMisCuentas: ${error.stack}`);
        throw error;
    }
}

export async function getAccountBySenderId(dbConnection, companyId, senderId) {
    try {
        if (accountList === undefined || accountList === null || Object.keys(accountList).length === 0 || !accountList[companyId]) {
            logYellow(`Cargando mis cuentas...`);
            await loadAccountList(dbConnection, companyId, senderId);
        }

        const account = accountList[companyId][senderId];

        return account;
    } catch (error) {
        logRed(`Error en getAccountBySenderId: ${error.stack}`);
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
        logRed(`Error en loadClients para la compañía ${companyId}: ${error.stack}`);
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
                logRed(`Error al cargar compañías desde Redis: ${error.stack}`);
                throw companyClients;
            }
        }

        return companyClients;
    } catch (error) {
        logRed(`Error en getClientsByCompany: ${error.stack}`);
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
        logRed(`Error en loadDrivers para la compañía ${companyId}: ${error.stack}`);
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
                logRed(`Error al cargar compañías desde Redis: ${error.stack}`);
                throw companyDrivers;
            }
        }

        return companyDrivers;
    } catch (error) {
        logRed(`Error en getDriversByCompany para la compañía ${companyId}: ${error.stack}`);
        throw error;
    }
}

export async function executeQuery(connection, query, values, log = false) {
    if (log) {
        logYellow(`Ejecutando query: ${query} con valores: ${values}`);
    }
    try {
        return new Promise((resolve, reject) => {
            connection.query(query, values, (err, results) => {
                if (err) {
                    if (log) {
                        logRed(`Error en executeQuery: ${err.message}`);
                    }
                    reject(err);
                } else {
                    if (log) {
                        logYellow(`Query ejecutado con éxito: ${JSON.stringify(results)}`);
                    }
                    resolve(results);
                }
            });
        });
    } catch (error) {
        logRed(`Error en executeQuery: ${error.stack}`);
        throw error;
    }
}