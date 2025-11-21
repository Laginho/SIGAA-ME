// A dummy login handler to prevent sigaa-api from loading the default IFSC handler
export class DummyLogin {
    async login(_username: string, _password: string): Promise<any> {
        throw new Error('DummyLogin should not be called directly.');
    }
}
