import redis from 'redis';
import dotenv from 'dotenv';

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

export async function getCompanyById(companyCode) {
    if (!Array.isArray(companiesList) || companiesList.length === 0) {
        try {
            await loadCompaniesFromRedis();
        } catch (error) {
            console.error("Error al cargar las empresas desde Redis2:", error);
            throw error;
        }
    }

    return companiesList.find(company => Number(company.did) === Number(companyCode)) || null;
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