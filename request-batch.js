import axios from "axios";

const requestBatchProcess = (body) => {
    return axios({
        method: "post",
        headers: {
            "Content-Type": "application/json",
        },
        url: "http://localhost:8080/tesiscontrollers/tesis",
        data: body,
    });
};

export default  requestBatchProcess;