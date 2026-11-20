
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

// CONFIGURACION

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const LOG_DIR = path.join(ROOT, 'logs');

fs.mkdirSync(LOG_DIR, { recursive: true });

// FECHA Y HORA

const ahora = new Date();

const fechaHora = ahora.toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'long'
});

const fechaArchivo = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0')
].join('-');

const horaArchivo = [
    String(ahora.getHours()).padStart(2, '0'),
    String(ahora.getMinutes()).padStart(2, '0'),
    String(ahora.getSeconds()).padStart(2, '0')
].join('-');

// OBTENER VERSIONES DE GIT

function ejecutarGit(argumentos) {
    return execFileSync('git', argumentos, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
}

function obtenerVersiones() {

    let versionActual = 'SIN VERSION';
    let versionCercana = 'SIN VERSION';

    try {
        // buscar etiquetas que apunten al commit actual
        const etiquetas = ejecutarGit([
            'tag',
            '--points-at',
            'HEAD',
            '--sort=-version:refname'
        ]);

        if (etiquetas) {
            versionActual = etiquetas.split(/\r?\n/)[0];
            versionCercana = versionActual;
        }

        // buscar la etiqueta anterior mas cercana
        if (versionActual === 'SIN VERSION') {

            try {
                versionCercana = ejecutarGit([
                    'describe',
                    '--tags',
                    '--abbrev=0'
                ]);
            } catch {
                versionCercana = 'SIN VERSION';
            }
        }

    } catch (error) {
        console.error('No fue posible consultar las versiones de Git.');
    }

    return {
        actual: versionActual,
        cercana: versionCercana
    };
}

const versiones = obtenerVersiones();

// REGISTRO DE PRUEBAS

let resultados = [];
let exitos = 0;
let errores = 0;

function registrarPrueba(nombre, callback) {

    try {

        callback();

        resultados.push(`[EXITOSO] ${nombre}`);
        exitos++;

        console.log(`[EXITOSO] ${nombre}`);

    } catch (error) {

        resultados.push(`[ERROR] ${nombre}: ${error.message}`);
        errores++;

        console.error(`[ERROR] ${nombre}: ${error.message}`);
    }
}

function verificar(condicion, mensaje) {
    if (!condicion) {
        throw new Error(mensaje);
    }
}

// CARGAR APLICACION

let html = '';
let codigoJavaScript = '';
let entorno = {};
let funcionDisponible = false;

registrarPrueba('Existe el archivo index.html', () => {

    verificar(
        fs.existsSync(HTML_PATH),
        'No se encontro index.html'
    );

    html = fs.readFileSync(HTML_PATH, 'utf8');
});

if (html) {

    registrarPrueba('Existe un bloque JavaScript en HTML', () => {

        const coincidencia = html.match(
            /<script\b[^>]*>([\s\S]*?)<\/script>/i
        );

        verificar(
            coincidencia,
            'No se encontro una etiqueta script'
        );

        codigoJavaScript = coincidencia[1];
    });

    if (codigoJavaScript) {

        registrarPrueba('El JavaScript se ejecuta sin errores de sintaxis', () => {

            entorno = {};

            vm.runInNewContext(
                codigoJavaScript,
                entorno,
                { timeout: 1000 }
            );
        });

        funcionDisponible =
            typeof entorno.calcularNumeroAleatorio === 'function';

        registrarPrueba('Existe la funcion calcularNumeroAleatorio()', () => {

            verificar(
                funcionDisponible,
                'La funcion fue eliminada o cambio de nombre'
            );
        });

        if (funcionDisponible) {

            const calcular = entorno.calcularNumeroAleatorio;

            registrarPrueba('Genera numeros enteros', () => {

                for (let i = 0; i < 100; i++) {

                    const numero = calcular(1, 100);

                    verificar(
                        Number.isInteger(numero),
                        `Resultado no entero: ${numero}`
                    );
                }
            });

            registrarPrueba('Respeta el rango minimo y maximo', () => {

                for (let i = 0; i < 1000; i++) {

                    const numero = calcular(1, 100);

                    verificar(
                        numero >= 1 && numero <= 100,
                        `Numero fuera del rango: ${numero}`
                    );
                }
            });

            registrarPrueba('Funciona cuando el minimo y maximo son iguales', () => {

                const numero = calcular(5, 5);

                verificar(
                    numero === 5,
                    'El resultado deberia ser exactamente 5'
                );
            });

            registrarPrueba('Rechaza valores decimales', () => {

                let rechazo = false;

                try {
                    calcular(1.5, 10);
                } catch {
                    rechazo = true;
                }

                verificar(rechazo, 'Acepto un valor decimal');
            });

            registrarPrueba('Rechaza un rango invertido', () => {

                let rechazo = false;

                try {
                    calcular(100, 1);
                } catch {
                    rechazo = true;
                }

                verificar(rechazo, 'Acepto un rango invertido');
            });
        }
    }
}

// GENERAR LOG

const estado = errores === 0 ? 'EXITOSO' : 'FALLIDO';

const contenidoLog = `
============================================
          REGISTRO DE CALIDAD CI/CD
============================================

Fecha y hora: ${fechaHora}

--------------------------------------------
VERSIONAMIENTO
--------------------------------------------

Version actual: ${versiones.actual}
Version mas cercana: ${versiones.cercana}

--------------------------------------------
RESULTADO DE LAS PRUEBAS
--------------------------------------------

${resultados.join('\n')}

--------------------------------------------
RESUMEN
--------------------------------------------

Estado general: ${estado}

Pruebas exitosas: ${exitos}
Pruebas fallidas: ${errores}
Total de pruebas: ${exitos + errores}

============================================
FIN DEL REGISTRO
============================================
`;

const rutaLog = path.join(
    LOG_DIR,
    `calidad-${fechaArchivo}_${horaArchivo}.txt`
);

fs.writeFileSync(rutaLog, contenidoLog, 'utf8');

console.log('\n============================================');
console.log(`Estado: ${estado}`);
console.log(`Version actual: ${versiones.actual}`);
console.log(`Version cercana: ${versiones.cercana}`);
console.log(`Exitos: ${exitos}`);
console.log(`Errores: ${errores}`);
console.log(`Log: ${rutaLog}`);
console.log('============================================\n');

// RESULTADO PARA GITHUB ACTIONS

if (errores > 0) {
    process.exitCode = 1;
} else {
    process.exitCode = 0;
}
