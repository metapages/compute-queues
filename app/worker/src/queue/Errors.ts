import { CustomError } from 'ts-custom-error'

export class ImageDoesNotExistError extends CustomError {
    constructor(message: string) {
        super(message);
        this.name = "ImageDoesNotExistError";
    }
}

export class DoesNotExistError extends CustomError {
    constructor(message: string) {
        super(message);
        this.name = "ImageDoesNotExistError";
    }
}
