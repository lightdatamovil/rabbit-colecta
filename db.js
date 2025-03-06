import redis from 'redis';
import dotenv from 'dotenv';
import mysql from 'mysql';

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
    console.error('Error al conectar con Redis:', err);
});

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

let companiesList = [];
let clientList = [];
let accountList = {};

export async function loadAccountList(dbConnection, senderId) {
    try {
        const querySelectClientesCuentas = `
                SELECT did, didCliente, ML_id_vendedor 
                FROM clientes_cuentas 
                WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1
            `;

        const result = await executeQuery(dbConnection, querySelectClientesCuentas);

        result.forEach(row => {
            accountList[row.ML_id_vendedor] = {
                didCliente: row.didCliente,
                didCuenta: row.did,
            };
        });

        return accountList[senderId];
    } catch (error) {
        console.error("Error en obtenerMisCuentas:", error);
        throw error;
    }
}

export async function getAccountBySenderId(dbConnection, senderId) {
    try {
        if (accountList === undefined || accountList === null || Object.keys(accountList).length === 0) {
            await loadAccountList(dbConnection, senderId);
        }

        if (accountList[senderId] === undefined || accountList[senderId] === null) {
            throw new Error("No se encontró la cuenta del vendedor");
        }

        const account = accountList[senderId];

        return account;
    } catch (error) {
        console.error("Error en getAccountBySenderId:", error);
        throw error;
    }
}


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
        const companysDataJson = await redisClient.get('empresasData');
        companiesList = companysDataJson ? Object.values(JSON.parse(companysDataJson)) : [];
    } catch (error) {
        console.error("Error al cargar las empresas desde Redis:", error);
        throw error;
    }
}

export async function getCompanyById(companyId) {
    if (!Array.isArray(companiesList) || companiesList.length === 0) {
        try {
            await loadCompaniesFromRedis();
        } catch (error) {
            console.error("Error al cargar las empresas desde Redis2:", error);
            throw error;
        }
    }

    return companiesList.find(company => Number(company.did) === Number(companyId)) || null;
}

export async function getClientsByCompany(company) {
    try {
        const companyClients = clientList.find(client => client.companyId == company.did);

        if (companyClients === undefined || companyClients === null || companyClients.length == 0) {
            const clients = await getClients(company);
            const companyClientsR = clients.find(client => client.companyId == company.did).clients || [];

            return companyClientsR;
        } else {
            return companyClients.clients || [];
        }
    } catch (error) {
        console.error("Error en getClientsByCompany:", error);
        throw error;
    }
}

export async function getClients(company) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        const queryUsers = "SELECT * FROM clientes";

        const resultQueryUsers = await executeQuery(dbConnection, queryUsers, []);

        const clients = [];

        for (let i = 0; i < resultQueryUsers.length; i++) {
            const row = resultQueryUsers[i];

            const client = {
                id: row.id,
                id_origen: row.id_origen,
                fecha_sincronizacion: row.fecha_sincronizacion,
                did: row.did,
                codigo: row.codigo,
                nombre: row.nombre_fantasia,
                codigos: row.codigos,
                dataGeo: row.dataGeo,
            };

            clients.push(client);
        }
        clientList.push({ companyId: company.did, clients: clients });

        return clientList;
    } catch (error) {
        console.error("Error en getClients:", error);
        throw error;
    } finally {
        dbConnection.end();
    }
}

export async function getCompanyByCode(companyCode) {
    let company = companiesList.find(company => String(company.codigo) === String(companyCode)) || null;

    if (!Array.isArray(companiesList) || companiesList.length == 0 || companiesList == null) {
        try {
            await loadCompaniesFromRedis();
            company = companiesList.find(company => String(company.codigo) === String(companyCode)) || null;
        } catch (error) {
            console.error("Error en getCompanyByCode:", error);
            throw error;
        }
    }

    return company;
}

export async function executeQuery(connection, query, values) {
    // console.log("Query:", query);
    // console.log("Values:", values);
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
        console.error("Error al ejecutar la query:", error);
        throw error;
    }
}

function empresaDuenia(codigoBuscado, AempresasGlobal) {
    if (!AempresasGlobal) {
        console.error("AempresasGlobal no está definido");
        return null;
    }

    for (const key in AempresasGlobal) {
        if (AempresasGlobal[key].codigo === codigoBuscado) {
            const e = AempresasGlobal[key];
            return e;
        }
    }

    console.error(`No se encontró la empresa con el código: ${codigoBuscado}`);
    return null;
}