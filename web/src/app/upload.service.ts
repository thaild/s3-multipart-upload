import { EventEmitter, Injectable } from '@angular/core';
import {HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpParams, HttpRequest, HttpResponse} from '@angular/common/http';
import * as internal from 'events';

export interface IS3Data {
  folder: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface IParamStartUpload {
  fileName: string;
  fileType: string;
}

export interface IParamGetPresignURL {
  fileName: string;
  fileType: string;
  partNo: string;
  uploadId: string;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  uploadProgress$ = new EventEmitter<any>();
  finishedProgress$ = new EventEmitter<any>();

  // url: string = 'https://ja82yuetbb.execute-api.ap-southeast-1.amazonaws.com/dev';
  url = 'http://10.1.38.246:5000';

  constructor(private httpClient: HttpClient) {
  }

  getHeaders(method: string) {
    const headers: any = {};

    if (method === 'post') {
      headers['Content-type'] = 'application/json';
    }

    return {
      headers: new HttpHeaders(headers),
    };
  }

  // -------------------------------
  // --- Presigned URL -------------
  // -------------------------------

  /**
   * Initiate a multipart upload.
   *
   */
  private startUpload(params: IParamStartUpload): Promise<any> {
    const httpParams = new HttpParams()
      .set('file_name', encodeURIComponent(params.fileName))
      .set('file_type', encodeURIComponent(params.fileType));

    return this.httpClient.get(`${this.url}/start-upload`, { params: httpParams }).toPromise();
  }

  private getPresignUrl(params: IParamGetPresignURL): Promise<any> {
    const httpParams = new HttpParams()
      .set('file_name', encodeURIComponent(params.fileName))
      .set('file_type', encodeURIComponent(params.fileType))
      .set('part_no', params.partNo)
      .set('upload_id', params.uploadId);
    return this.httpClient.get(`${this.url}/get-upload-url`, { params: httpParams }).toPromise();

  }

  /**
   * Upload MultiPart.
   *
   */
  async uploadMultipartFile(file: any, tokenEmit: string) {
    const uploadStartResponse = await this.startUpload({
      fileName: file.name,
      fileType: file.type
    });

    try {
      const FILE_CHUNK_SIZE = 10000000; // 10MB
      // const FILE_CHUNK_SIZE = 5000000; // 5MB
      const fileSize = file.size;
      const NUM_CHUNKS = Math.floor(fileSize / FILE_CHUNK_SIZE) + 1;
      // tslint:disable-next-line:one-variable-per-declaration
      let start, end, blob;

      const uploadPartsArray = [];
      let countParts = 0;

      const orderData = [];

      for (let index = 1; index < NUM_CHUNKS + 1; index++) {
        start = (index - 1) * FILE_CHUNK_SIZE;
        end = (index) * FILE_CHUNK_SIZE;
        blob = (index < NUM_CHUNKS) ? file.slice(start, end) : file.slice(start);

        // const httpParams = new HttpParams()
        //   .set('file_name', encodeURIComponent(file.name))
        //   .set('file_type', encodeURIComponent(file.type))
        //   .set('part_no', index.toString())
        //   .set('upload_id', uploadStartResponse.data.upload_id);

        // (1) Generate presigned URL for each part

        console.log(uploadStartResponse);

        const uploadUrlPresigned = await this.getPresignUrl({
          fileName: file.name,
          fileType: file.type,
          partNo: index.toString(),
          uploadId: uploadStartResponse.upload_id
        });

        // (2) Puts each file part into the storage server

        orderData.push({
          presignedUrl: uploadUrlPresigned.upload_signed_url,
          index
        });

        const req = new HttpRequest('PUT', uploadUrlPresigned.upload_signed_url, blob, {
          reportProgress: true
        });

        this.httpClient
          .request(req)
          .subscribe((event: HttpEvent<any>) => {
            switch (event.type) {
              case HttpEventType.UploadProgress:
                const percentDone = Math.round(100 * event.loaded / FILE_CHUNK_SIZE);
                this.uploadProgress$.emit({
                  progress: file.size < FILE_CHUNK_SIZE ? 100 : percentDone,
                  token: tokenEmit
                });
                break;
              case HttpEventType.Response:
                console.log('😺 Done!');
            }

            // (3) Calls the CompleteMultipartUpload endpoint in the backend server

            if (event instanceof HttpResponse) {
              const currentPresigned = orderData.find(item => item.presignedUrl === event.url);

              countParts++;
              uploadPartsArray.push({
                ETag: event.headers.get('ETag').replace(/[|&;$%@"<>()+,]/g, ''),
                PartNumber: currentPresigned.index
              });
              if (uploadPartsArray.length === NUM_CHUNKS) {
                console.log(file.name);
                console.log(uploadPartsArray);
                console.log(uploadStartResponse.upload_id);
                const headers = this.getHeaders('post');
                console.log(headers);
                this.httpClient.post(`${this.url}/complete-upload`, {
                  file_name: encodeURIComponent(file.name),
                  parts: uploadPartsArray.sort((a, b) => {
                    return a.PartNumber - b.PartNumber;
                  }),
                  upload_id: uploadStartResponse.upload_id
                }).toPromise()
                  .then(res => {
                    this.finishedProgress$.emit({
                      data: res
                    });
                  });
              }
            }
          });
      }
    } catch (e) {
      console.log('error: ', e);
    }
  }

}
