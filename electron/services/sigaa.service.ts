import { Sigaa } from 'sigaa-api';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;

    constructor() {
        this.sigaa = new Sigaa({
            url: 'https://sigaa.ifsc.edu.br' // We might need to make this configurable later!
        });
    }

    // We will add login methods here soon!
}
