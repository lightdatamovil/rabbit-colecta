


const redis = require('redis');




const redisClient = redis.createClient({
    socket: {
        host: '192.99.190.137',
        port: 50301,
    },
    password: 'sdJmdxXC8luknTrqmHceJS48NTyzExQg',
});
let Aempresas;

async function actualizarEmpresas(Aempresas) {
    const empresasDataJson = await redisClient.get('empresas');
      Aempresas = JSON.parse(empresasDataJson);
   return Aempresas
  
}

async function iniciarProceso() {
    try {
        // Conectar a Redis
        await redisClient.connect();

        // Actualizar empresas antes de cerrar la conexión
       let empresas = await actualizarEmpresas(Aempresas);

        // Cerrar la conexión de Redis
        await redisClient.quit();
        console.log("Conexión a Redis cerrada.");
        return empresas
    } catch (error) {
        console.error("Error en el proceso:", error);
    }
}

 async function executeQuery(connection, query, values) {
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
module.exports= {iniciarProceso,executeQuery,redisClient}
