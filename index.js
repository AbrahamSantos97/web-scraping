import puppeteer, { Browser, Page } from "puppeteer";  
import fs from "fs";
import cron from "node-cron";
import requestBatchProcess from "./request-batch.js";
import winston from "winston";

const logger  = winston.createLogger({
    level:'error',
    format: winston.format.json(),
    defaultMeta: {service:'user-service'},
    transports:[new winston.transports.File({filename:'error.log',level:'error'})]
});

async function openBrowser(){
    //Iniciamos el navegador, el headless en false para ver el navegador, el slowMo para que nos de tiempo de ver la interaccion
    const browser = await createBrowser();
    //Abrimos una nueva pestana del navegador
    const page = await gotoInNewPage('https://sjf2.scjn.gob.mx/busqueda-principal-tesis',browser);
    try{
        //Damos click aqui para ver todas las tesis
        await page.click('.butAll');
        // En teoria el meotodo pasado deberia funcionar tambien para dar click al 'button-addon1_add' pero no es posible,
        //se hizo asi solo para poder disparar el evento
        await page.evaluate(()=> document.querySelector('#button-addon1_add').click());
        //Promesa que hacemos en lo que la pagina termina de cargar
        await timer();
        //Hacemos un ordenamiento ascendente (mas viejo al mas reciente), 
        //asi los que se puedan ir agregando con el tiempo no deberian afectar.
        await page.click('#mat-select-2');
        //Esperamos aque salgo el menu de ordenamiento
        await timer();
        //damos click al ordenamiento que queremos.
        await page.evaluate(()=> document.querySelectorAll('.mat-option-text')[1].click());
        //Esperamos a que ordene
        await timer();
        //Debemos checar si se quedo con algun registro incompleto.
        let paginaPersistencia = await movePointer(page);
        //Damos click a la primera referencia que se encuentre de una tesis, para verla completa
        const cadena = await page.evaluate(() => document.querySelectorAll("mat-selection-list > .text-center")[1].innerText);
        //Se obtiene la cantidad exacta de tesis que se necesitan recopilar
        const totalTesis = parseInt(cadena.match(/([\d])+/g)[2]);
        //El total de vueltas que se haran, para ir dandole una pausa cada 1000
        const real = parseInt((totalTesis/20))+1;
        //Damos clic en el boton para ingresar a la primera tesis cargada
        await page.click("#linkVisit");
        //Promesa que hacemos en lo que la pagina termina de cargar
        await timer();
        //Asignamos el valor del index
        let index = paginaPersistencia?paginaPersistencia:0;
        let jsonHelper = {pagina:index,ficheros:[]};
        for (index; index < real; index++) {
            let arr = await getTesis(20,page); 
            jsonHelper.pagina = (index + 1);
            jsonHelper.ficheros.push(`fichero-tesis-${index}.json`);
            await fs.promises.writeFile(`helper.json`,JSON.stringify(jsonHelper),null,3);
            await fs.promises.writeFile(`fichero-tesis-${index}.json`,JSON.stringify(arr),null,3);
        }
        }catch(error){
            logger.error(`el error que ocurrio fue: ${error} en ${error}`);
        }
}

/**
 * Funcion que se encarga de crear el navegador el cual se usara para hacer el barrido de la informacion
 * @returns {Browser} funcion que regresa la instancia del navegador recien creado.
 */
async function createBrowser(){
    return await puppeteer.launch({headless:'new',slowMo:300});
}

/**
 * Funcion que devuelve la creacion de una nueva pagina en el navegador en una ruta/url especifica, asi con un viewport funcional.
 * @param {String} url - Ruta que se quiere abrir en la pagina del navegador
 * @param {Browser} browser - Navegador en la cual se abrira la ventana.
 * @returns {Page} pagina con las especificaciones.
 */
async function gotoInNewPage(url,browser){
    const page = await browser.newPage();
    //Le decimos a donde iremos al navegador, es la vista de todas las tesis
    await page.goto(url);
    //Agrandamos el viewport para que se aprecie bien
    await page.setViewport({width:1920,height:1080});
    //regresamos la pagina
    return page;
}

/**
 * Funcion asincrona que lo que hace es regresar un arreglo de json que contienen las tesis, asi como informacion relevante de la tesis.
 * @param {Page} page - Debe enviarse la pagina para poder acceder a los elementos HTML.
 * @returns {Array} -Arreglo de JSON obtenidos de las iteraciones.
 */
async function movePointer(page){
    if(!fs.existsSync('helper.json'))return 0;
    const fichero = await fs.promises.readFile('helper.json');
    const persistencia = JSON.parse(fichero);
    let paginaPersistencia = 0;
    if(persistencia){
        paginaPersistencia = persistencia.pagina;
        let flagPageFound = true;
        do{
            const values = await page.evaluate(() => 
                 [...document.querySelectorAll('li[class="page-item ng-star-inserted"] ,li[class="page-item active"]')]
                .map(element => element.innerText));
           const index = values.indexOf(paginaPersistencia.toString());
            const elemets = await page.$$('li[class="page-item ng-star-inserted"] ,li[class="page-item active"]');
            if(index != -1){ 
                elemets[index].click();
                flagPageFound = false;
            }else elemets.slice(-1)[0].click();
            await timer(5000);
        }while(flagPageFound);
    }
    return paginaPersistencia;
}

/**
 * Funcion que se hizo para normalizar la funcion de promesa en el traslado entre paginas, por defecto 3s.
 * @param {int} time 
 */
async function timer(time = 3000){
    await new Promise((resolve) => setTimeout(resolve,time));  
}

/**
 * Funcion asincrona que lo que hace es regresar un arreglo de json que contienen las tesis, asi como informacion relevante de la tesis.
 * @param {int} iteraciones - El numero de tesis que debe recorrer, debe ser calculado previamente, no tiene valor por defecto
 * @param {Page} page - Debe enviarse la pagina para poder acceder a los elementos HTML.
 * @returns {Array} -Arreglo de JSON obtenidos de las iteraciones.
 */
async function getTesis(iteraciones,page){
    let arr = [];
    for (let index = 0; index < iteraciones; index++) {
        const element = await page.evaluate(()=> {
            let body = {};
            [...document.querySelectorAll('.Temp')].map(e=> e.innerText).map(e=> e.split(': ')).forEach(elem =>{
                if(elem.length > 1){
                    const key = elem[0].replaceAll(' ','_').replaceAll('(s)','s').toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    body[`${key}`] = elem[1].replaceAll("\\n",'');
                }else{
                    body.epoca = elem[0].replaceAll("\\n",'');
                }
             });
             const rubro = document.querySelector('#divRubro').innerText;
             const contenido = [...document.querySelectorAll('#divTexto > p')].map(cont => cont.innerText);
             const precedente = [...document.querySelectorAll('#divPrecedente > p')].map(cont => cont.innerText);
             const publicacion = document.querySelector('.publicacion').innerText;
             body.rubro = rubro;
             body.contenido = contenido
             body.precedente = precedente;
             body.publicacion = publicacion;
             const nextArrow = document.querySelector('li[ngbtooltip="Registro siguiente"]');
             if(nextArrow && !nextArrow.classList.contains('disabled')){
                nextArrow.firstElementChild.click();
             }
             return body;
        });
        arr.push(element);

        const ahead = await page.evaluate(() => {
            const nextArrow = document.querySelector('li[ngbtooltip="Registro siguiente"]');
            return nextArrow && nextArrow.classList.contains('disabled');
        });
        if(ahead)break;
        await timer(2500);    
    }
    return arr;
}

async function startRequest(){
    let contenido = await fs.promises.readFile('helper.json');
    let json = JSON.parse(contenido);
    let allELement = [];
    for (let index = 0; index < json.ficheros.length; index++) {
        const content =  await fs.promises.readFile(json.ficheros[index]);
        JSON.parse(content).forEach(e=> allELement.push(e));
    }
    const response = await requestBatchProcess(allELement);
    if(response.status == 200) {
        console.log('La informacion llego correctamente');
    }
}

startRequest();
//cron.schedule('30 16 * * *',() => startRequest());
//openBrowser();

