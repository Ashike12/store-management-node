import { OrderOperationsService } from './business/services/order-operations.service';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import request = require('supertest');
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { BusinessController } from './business/business.controller';
import { ProductService } from './business/services/product.service';
import { InvoiceService } from './business/services/invoice.service';
import { ClientOrderService } from './business/services/client-order.service';
import { AiSuggestionService } from './business/services/ai-suggestion.service';
import { StorageController } from './storage/storage.controller';
import { StorageService } from './storage/storage.service';
import { RedisHelperService } from './services/redis-helper.service';
import { InventoryService } from './business/services/inventory.service';
import { EmployeeController } from './employee/employee.controller';
import { EmployeeService } from './employee/employee.service';

const product = {
  RequestId: 'product-create-request-1',
  ProductName: 'Test net',
  Description: 'Test description',
  Category: 'MosquitoNet',
  SubCategory: 'Double',
  NetHeight: '5',
  ImageLinks: ['https://example.com/net.jpg'],
  VideoLink: '',
  MakingPrice: 100,
  WholeSalerPrice: 150,
  EndUserPrice: 200,
  EndUserDiscountedPrice: 180,
  Quantity: 10,
};
const person = {
  FirstName: 'Test',
  LastName: 'User',
  Phone: '01700000000',
  Email: 'test@example.com',
  Password: 'test-password',
  Roles: ['customer'],
  NRIC: '',
  Address: 'Dhaka',
  CBC: '',
  Finance: 0,
};
const invoice = {
  PaymentAmount: 100,
  InvoiceType: 'DUE_PAYMENT',
  WholeSalerId: 'wholesaler-1',
  ProductSellInfo: [],
};
const order = {
  RequestId: '12345678-1234-4123-8123-123456789abc',
  CustomerName: 'Test',
  PhoneNumber: '01700000000',
  Division: 'Dhaka',
  District: 'Dhaka',
  Area: 'Test',
  PostCode: '1200',
  Address: 'Test address',
  DeliveryZone: 'inside_dhaka',
  CaptchaToken: 'test-only',
  Items: [
    {
      ProductId: 'product-1',
      ProductName: 'Net',
      Category: 'MosquitoNet',
      SubCategory: 'Double',
      ImageLinks: [],
      UnitPrice: 180,
      Quantity: 1,
    },
  ],
};
const user = { _id: 'admin-1', Roles: ['admin'] };
const controllers = [
  AppController,
  AuthController,
  UserController,
  BusinessController,
  StorageController,
  EmployeeController,
];
type Case = {
  method: 'get' | 'post';
  path: string;
  service: any;
  call: string;
  body?: any;
  public?: boolean;
  invalid?: any;
  args?: any[];
  restricted?: boolean;
  token?: string;
};
const cases: Case[] = [
  {
    method: 'post',
    path: '/business/ListOrders',
    service: OrderOperationsService,
    call: 'list',
    body: { Page: 1, Size: 10 },
    invalid: { Page: 0 },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/GetOrder',
    service: OrderOperationsService,
    call: 'detail',
    body: { ItemId: 'order-1' },
    args: ['order-1', user],
    invalid: {},
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/TransitionOrder',
    service: OrderOperationsService,
    call: 'transition',
    body: { ItemId: 'order-1', Status: 'confirmed', ExpectedVersion: 0 },
    invalid: { Status: 'paid' },
    restricted: true,
  },
  {
    method: 'get',
    path: '/',
    service: AppService,
    call: 'getHello',
    public: true,
    args: [],
  },
  {
    method: 'post',
    path: '/auth/signup',
    service: AuthService,
    call: 'signUp',
    body: person,
    public: true,
    invalid: {},
    args: [person],
  },
  {
    method: 'post',
    path: '/auth/token',
    service: AuthService,
    call: 'login',
    body: {
      Email: person.Email,
      Password: person.Password,
      GrantType: 'password',
    },
    public: true,
    invalid: {},
  },
  {
    method: 'post',
    path: '/auth/refresh',
    service: AuthService,
    call: 'refresh',
    body: { RefreshToken: 'test' },
    public: true,
    invalid: {},
  },
  {
    method: 'post',
    path: '/auth/setPassword',
    service: AuthService,
    call: 'setPassword',
    body: { Password: person.Password, ActivationId: 'activation-1' },
    public: true,
    invalid: {},
  },
  {
    method: 'post',
    path: '/auth/getloginlog',
    service: AuthService,
    call: 'getLoginLog',
    body: { StartDate: '2026-10-01', EndDate: '2026-10-23' },
    invalid: {},
  },
  {
    method: 'get',
    path: '/user/get',
    service: UserService,
    call: 'findAll',
    args: [{}, user],
  },
  {
    method: 'get',
    path: '/user/me',
    service: UserService,
    call: 'getCurrentUser',
    args: [user],
  },
  {
    method: 'get',
    path: '/user/getById/:id',
    service: UserService,
    call: 'findById',
    public: true,
    args: ['test-id'],
  },
  {
    method: 'post',
    path: '/user/getByEmail',
    service: UserService,
    call: 'findByEmail',
    body: { Email: person.Email },
    invalid: {},
    args: [person.Email, user],
  },
  {
    method: 'post',
    path: '/user/createCustomer',
    service: UserService,
    call: 'createCustomer',
    body: person,
    invalid: {},
  },
  {
    method: 'post',
    path: '/user/update',
    service: UserService,
    call: 'updateById',
    body: { ItemId: 'test-id', Phone: person.Phone },
    invalid: {},
  },
  {
    method: 'post',
    path: '/user/update-profile',
    service: UserService,
    call: 'updateCurrentUser',
    body: { DisplayName: 'Updated' },
  },
  {
    method: 'post',
    path: '/user/change-password',
    service: UserService,
    call: 'changePassword',
    body: { CurrentPassword: person.Password, NewPassword: 'new-password' },
    invalid: {},
  },
  {
    method: 'post',
    path: '/user/delete',
    service: UserService,
    call: 'deleteById',
    body: { ItemId: 'test-id' },
    invalid: {},
    args: ['test-id', user],
  },
  {
    method: 'post',
    path: '/business/GetProducts',
    service: ProductService,
    call: 'getProduct',
    body: { Category: 'MosquitoNet', SubCategory: 'Double' },
    invalid: { MinMakingPrice: 'bad' },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/GetClientProducts',
    service: ProductService,
    call: 'getClientProduct',
    body: {},
    public: true,
    invalid: { Category: 123 },
  },
  {
    method: 'post',
    path: '/business/VerifyProductQr',
    service: ProductService,
    call: 'verifyProductQr',
    body: { Token: 'valid_QR-token' },
    args: ['valid_QR-token'],
    public: true,
    invalid: { Token: 'invalid token!' },
  },
  {
    method: 'post',
    path: '/business/ConfigureProductQr',
    service: ProductService,
    call: 'configureQrVerification',
    body: { ItemId: 'test-id', Action: 'enable' },
    invalid: { ItemId: 'test-id', Action: 'invalid' },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/QuoteBuilder',
    service: ClientOrderService,
    call: 'quoteBuilder',
    body: { BuildType: 'MosquitoNet', Quantity: 1, CustomOptions: {} },
    public: true,
    invalid: { BuildType: 'WindowNet', Quantity: 0, CustomOptions: [] },
  },
  {
    method: 'post',
    path: '/business/CreateClientOrder',
    service: ClientOrderService,
    call: 'createOrder',
    body: order,
    public: true,
    invalid: { ...order, Items: [] },
  },
  {
    method: 'post',
    path: '/business/CreateProduct',
    service: ProductService,
    call: 'createProduct',
    body: product,
    invalid: {},
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/UpdateProduct',
    service: ProductService,
    call: 'updateProduct',
    body: { ...product, ItemId: 'test-id' },
    invalid: {},
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/DeleteProduct',
    service: ProductService,
    call: 'deleteById',
    body: { ItemId: 'test-id' },
    invalid: {},
    args: ['test-id'],
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/CreateInvoice',
    service: InvoiceService,
    call: 'createInvoice',
    body: invoice,
    invalid: {},
    args: [invoice, user],
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/UpdateInvoice',
    service: InvoiceService,
    call: 'updateInvoice',
    body: { ...invoice, ItemId: 'test-id' },
    invalid: {},
    args: [{ ...invoice, ItemId: 'test-id' }, user],
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/GetInvoice',
    service: InvoiceService,
    call: 'getInvoiceList',
    body: { ItemId: '' },
    invalid: { ItemId: 123 },
    args: [{}, { ItemId: '', WholesalerId: null }, user],
  },
  {
    method: 'post',
    path: '/business/DeleteInvoice',
    service: InvoiceService,
    call: 'deleteInvoiceById',
    body: { ItemId: 'test-id' },
    invalid: {},
    args: ['test-id', user],
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/GetDashboardData',
    service: InvoiceService,
    call: 'getDashboardStatsData',
    args: [user],
  },
  {
    method: 'post',
    path: '/business/AddProduction',
    service: ProductService,
    call: 'addProduction',
    body: {
      RequestId: 'production-request-1',
      ProductionInfo: [{ ProductId: 'test-id', Quantity: 10 }],
    },
    invalid: {
      RequestId: 'production-request-invalid',
      ProductionInfo: [{ ProductId: 'test-id', Quantity: 0 }],
    },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/ListProductBatches',
    service: InventoryService,
    call: 'listBatches',
    body: { ProductId: 'test-id', Page: 1, Size: 10 },
    invalid: { ProductId: '', Page: 0, Size: 101 },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/ListBatchItems',
    service: InventoryService,
    call: 'listItems',
    body: { BatchId: 'batch-id', Page: 1, Size: 25 },
    invalid: { BatchId: '', Page: 0, Size: 101 },
    restricted: true,
  },
  {
    method: 'post',
    path: '/business/GenerateAiSuggestion',
    service: AiSuggestionService,
    call: 'generateSuggestion',
    body: { FieldName: 'Description', ProductName: 'Test' },
    invalid: {},
    restricted: true,
  },
  {
    method: 'post', path: '/employee/CreateEmployee', service: EmployeeService,
    call: 'createEmployee', restricted: true,
    body: { FirstName: 'Rafiq', LastName: 'Worker', Email: 'rafiq@example.com', Phone: '01700000001', Address: 'Dhaka', Password: 'strong-password' },
    invalid: { FirstName: '', Email: 'bad' },
  },
  {
    method: 'post', path: '/employee/ListEmployees', service: EmployeeService,
    call: 'listEmployees', restricted: true,
    body: { Status: 'active', Page: 1, Size: 20 }, invalid: { Page: 0, Size: 101 },
  },
  {
    method: 'post', path: '/employee/UpdateEmployee', service: EmployeeService,
    call: 'updateEmployee', restricted: true,
    body: { ItemId: 'employee-1', DisplayName: 'Rafiq Worker' }, invalid: { ItemId: '' },
  },
  {
    method: 'post', path: '/employee/DeactivateEmployee', service: EmployeeService,
    call: 'deactivateEmployee', restricted: true,
    body: { EmployeeId: 'employee-1' }, invalid: { EmployeeId: '' },
    args: ['employee-1', user],
  },
  {
    method: 'post', path: '/employee/GetOverview', service: EmployeeService,
    call: 'getOverview', body: { EmployeeId: 'employee-1' }, invalid: { EmployeeId: 1 },
    args: [{ EmployeeId: 'employee-1' }, user],
  },
  {
    method: 'post', path: '/employee/CreateWorkEntry', service: EmployeeService,
    call: 'createWorkEntry', restricted: true,
    body: { EmployeeId: 'employee-1', WorkDate: '2026-10-27', Description: 'Made mosquito nets', Amount: 500 },
    invalid: { EmployeeId: '', WorkDate: '', Description: '', Amount: 0 },
  },
  {
    method: 'post', path: '/employee/ListEmployeeBatches', service: EmployeeService,
    call: 'listEmployeeBatches', restricted: true,
    body: { EmployeeId: 'employee-1', SearchTerm: 'net', Page: 1, Size: 20 },
    invalid: { EmployeeId: '', Page: 0, Size: 51 },
  },
  {
    method: 'post', path: '/employee/UpdateWorkEntry', service: EmployeeService,
    call: 'updateWorkEntry', restricted: true,
    body: { ItemId: 'work-1', Amount: 550 }, invalid: { ItemId: '', Amount: 0 },
  },
  {
    method: 'post', path: '/employee/DeleteWorkEntry', service: EmployeeService,
    call: 'deleteWorkEntry', restricted: true,
    body: { ItemId: 'work-1' }, invalid: { ItemId: '' },
    args: ['work-1', user],
  },
  {
    method: 'post', path: '/employee/CreatePaymentEntry', service: EmployeeService,
    call: 'createPaymentEntry', restricted: true,
    body: { EmployeeId: 'employee-1', PaymentDate: '2026-10-27', Amount: 300, Note: 'Cash' },
    invalid: { EmployeeId: '', PaymentDate: '', Amount: 0 },
  },
  {
    method: 'post', path: '/employee/UpdatePaymentEntry', service: EmployeeService,
    call: 'updatePaymentEntry', restricted: true,
    body: { ItemId: 'payment-1', Amount: 350 }, invalid: { ItemId: '', Amount: 0 },
  },
  {
    method: 'post', path: '/employee/DeletePaymentEntry', service: EmployeeService,
    call: 'deletePaymentEntry', restricted: true,
    body: { ItemId: 'payment-1' }, invalid: { ItemId: '' },
    args: ['payment-1', user],
  },
  {
    method: 'post', path: '/employee/SubmitFeedback', service: EmployeeService,
    call: 'submitFeedback', token: 'employee',
    body: { TargetType: 'work', TargetId: 'work-1', Explanation: 'Please review the amount' },
    invalid: { TargetType: 'other', TargetId: '', Explanation: '' },
    args: [{ TargetType: 'work', TargetId: 'work-1', Explanation: 'Please review the amount' }, { _id: 'employee-1', Roles: ['employee', 'appuser'] }],
  },
  {
    method: 'post', path: '/employee/ResolveFeedback', service: EmployeeService,
    call: 'resolveFeedback', restricted: true,
    body: { FeedbackId: 'feedback-1', Status: 'accepted', ResolutionNote: 'Reviewed' },
    invalid: { FeedbackId: '', Status: 'pending', ResolutionNote: '' },
  },
  {
    method: 'post', path: '/employee/ListNotifications', service: EmployeeService,
    call: 'listNotifications', restricted: true,
    body: { Status: 'unread', Page: 1, Size: 20 }, invalid: { Status: 'bad', Page: 0 },
  },
  {
    method: 'post', path: '/employee/MarkNotificationRead', service: EmployeeService,
    call: 'markNotificationRead', restricted: true,
    body: { FeedbackId: 'feedback-1' }, invalid: { FeedbackId: '' },
    args: ['feedback-1', user],
  },
  {
    method: 'post',
    path: '/storage/uploadFile',
    service: StorageService,
    call: 'UploadFile',
  },
  {
    method: 'get',
    path: '/storage/getFiles',
    service: StorageService,
    call: 'getAllDocs',
    args: [{}, user],
  },
  {
    method: 'get',
    path: '/storage/getFilesByUser/:userId',
    service: StorageService,
    call: 'getAllDocsByUser',
    public: true,
    args: [{}, 'test-id'],
  },
  {
    method: 'get',
    path: '/storage/getFile/:fileId',
    service: StorageService,
    call: 'GetFileInfo',
    public: true,
    args: ['test-id'],
  },
  {
    method: 'get',
    path: '/storage/deleteFile/:fileId',
    service: StorageService,
    call: 'GetFileInfo',
    public: true,
    args: ['test-id'],
  },
];

describe('API HTTP contracts (services mocked; no live infrastructure)', () => {
  let app: INestApplication;
  let directory: string;
  const previousStorageLocation = process.env.SRORAGE_LOCATION;
  const mocks = new Map<any, Record<string, jest.Mock>>();
  const redis = { incrementWithExpiryInSecond: jest.fn() };
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'store-api-tests-'));
    process.env.SRORAGE_LOCATION = directory + '/';
    writeFileSync(join(directory, 'fixture.txt'), 'test download');
    for (const c of cases) {
      if (!mocks.has(c.service)) mocks.set(c.service, {});
      mocks.get(c.service)[c.call] = jest.fn();
    }
    mocks.get(AuthService).getAnonymousToken = jest.fn();
    mocks.get(StorageService).DeleteDocument = jest.fn();
    const module = await Test.createTestingModule({
      controllers,
      providers: [
        ...Array.from(mocks, ([provide, useValue]) => ({ provide, useValue })),
        { provide: RedisHelperService, useValue: redis },
      ],
    })
      .overrideGuard(AuthGuard())
      .useValue({
        canActivate(context) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user =
            req.headers.authorization === 'Bearer wholesaler'
              ? { _id: 'wholesaler-1', Roles: ['wholesaler'] }
              : req.headers.authorization === 'Bearer employee'
                ? { _id: 'employee-1', Roles: ['employee', 'appuser'] }
              : req.headers.authorization === 'Bearer appuser'
                ? { _id: 'appuser-1', Roles: ['appuser'] }
                : user;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    for (const service of mocks.values())
      for (const fn of Object.values(service))
        fn.mockReset().mockResolvedValue({ success: true });
    mocks.get(StorageService).GetFileInfo.mockResolvedValue({
      FileLocation: directory,
      FileName: 'fixture.txt',
    });
    redis.incrementWithExpiryInSecond.mockReset().mockResolvedValue(1);
  });
  afterAll(async () => {
    await app?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (previousStorageLocation === undefined)
      delete process.env.SRORAGE_LOCATION;
    else process.env.SRORAGE_LOCATION = previousStorageLocation;
  });
  const send = (c: Case, body = c.body, token = c.token ?? 'admin') => {
    const call = request(app.getHttpServer())[c.method](
      c.path.replace(/:[^/]+/g, 'test-id'),
    );
    if (token) call.set('Authorization', `Bearer ${token}`);
    if (c.path === '/storage/uploadFile')
      call
        .field('customerId', 'customer-1')
        .attach('file', Buffer.from('fixture'), 'test.txt');
    else if (body) call.send(body);
    return call;
  };

  it('has an explicit test case for every registered route', () => {
    const actual: string[] = [];
    for (const controller of controllers) {
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        )
          continue;
        const route =
          '/' +
          [
            Reflect.getMetadata(PATH_METADATA, controller),
            Reflect.getMetadata(PATH_METADATA, handler),
          ]
            .join('/')
            .split('/')
            .filter(Boolean)
            .join('/');
        actual.push(
          `${Reflect.getMetadata(METHOD_METADATA, handler) === 0 ? 'get' : 'post'} ${route}`,
        );
        const test = cases.find((c) => c.path === route);
        expect(test).toBeDefined();
        if (!test.public)
          expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
            AuthGuard(),
          );
      }
    }
    expect(actual.sort()).toEqual(
      cases.map((c) => `${c.method} ${c.path}`).sort(),
    );
  });

  for (const c of cases) {
    describe(`${c.method.toUpperCase()} ${c.path}`, () => {
      it('routes a valid request to the expected service', async () => {
        const result = await send(c, c.body, c.public ? '' : (c.token ?? 'admin')).expect(
          200,
        );
        const mock = mocks.get(c.service)[c.call];
        expect(mock).toHaveBeenCalledTimes(1);
        if (c.args) expect(mock).toHaveBeenCalledWith(...c.args);
        else if (c.body)
          expect(mock.mock.calls[0]).toContainEqual(
            expect.objectContaining(c.body),
          );
        if (
          !c.path.startsWith('/storage/getFile/') &&
          !c.path.startsWith('/storage/deleteFile/')
        )
          expect(result.body).toEqual({ success: true });
        if (c.path.startsWith('/storage/deleteFile/'))
          expect(mocks.get(StorageService).DeleteDocument).toHaveBeenCalledWith(
            'test-id',
          );
      });
      it('preserves service error status', async () => {
        mocks
          .get(c.service)
          [
            c.call
          ].mockRejectedValueOnce(new BadRequestException('Test failure'));
        await send(c).expect(400);
      });
      if (!c.public)
        it('rejects missing authentication before calling the service', async () => {
          await send(c, c.body, '').expect(401);
          expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
        });
      if (c.invalid)
        it('rejects invalid DTO before calling the service', async () => {
          await send(c, c.invalid).expect(400);
          expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
        });
      if (c.restricted)
        it('blocks wholesaler access', async () => {
          await send(c, c.body, 'wholesaler').expect(403);
          expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
        });
    });
  }
  it('supports the anonymous token grant', async () => {
    await request(app.getHttpServer())
      .post('/auth/token')
      .send({ GrantType: 'authenticate_site' })
      .expect(200);
    expect(mocks.get(AuthService).getAnonymousToken).toHaveBeenCalledTimes(1);
  });
  it.each(['/business/GetInvoice', '/business/GetDashboardData'])(
    'blocks non-admin, non-wholesaler invoice read access for %s',
    async (path) => {
      const c = cases.find((item) => item.path === path);
      await send(c, c.body, 'appuser').expect(403);
      expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/business/CreateInvoice',
    '/business/UpdateInvoice',
    '/business/DeleteInvoice',
  ])('blocks non-admin invoice mutation access for %s', async (path) => {
    const c = cases.find((item) => item.path === path);
    await send(c, c.body, 'appuser').expect(403);
    expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
  });
  it.each([
    { ...invoice, PaymentAmount: '100' },
    { ...invoice, PaymentAmount: -1 },
    { ...invoice, UnexpectedField: true },
    {
      PaymentAmount: 100,
      InvoiceType: 'WHOLESALE',
      WholeSalerId: 'wholesaler-1',
      ProductSellInfo: [
        { ProductId: 'product-1', SellingPrice: 100, Quantity: 0 },
      ],
    },
    {
      PaymentAmount: 100,
      InvoiceType: 'WHOLESALE',
      WholeSalerId: 'wholesaler-1',
      ProductSellInfo: [
        { ProductId: 'product-1', SellingPrice: '100', Quantity: 1 },
      ],
    },
  ])(
    'rejects malformed invoice numbers before service execution',
    async (body) => {
      const c = cases.find((item) => item.path === '/business/CreateInvoice');
      await send(c, body).expect(400);
      expect(mocks.get(InvoiceService).createInvoice).not.toHaveBeenCalled();
    },
  );
  it('rejects an unknown token grant', async () => {
    await request(app.getHttpServer())
      .post('/auth/token')
      .send({ GrantType: 'invalid' })
      .expect(400);
    expect(mocks.get(AuthService).login).not.toHaveBeenCalled();
  });
  it.each([
    'GetClientProducts',
    'CreateClientOrder',
    'QuoteBuilder',
    'VerifyProductQr',
  ])(
    'rate-limits %s',
    async (route) => {
      redis.incrementWithExpiryInSecond.mockResolvedValue(31);
      const c = cases.find((c) => c.path === `/business/${route}`);
      await send(c, c.body, '').expect(429);
      expect(mocks.get(c.service)[c.call]).not.toHaveBeenCalled();
    },
  );
  it('rejects client prices on the quote request', async () => {
    await request(app.getHttpServer())
      .post('/business/QuoteBuilder')
      .send({
        BuildType: 'MosquitoNet',
        Quantity: 1,
        CustomOptions: {},
        UnitPrice: 1,
      })
      .expect(400);
    expect(mocks.get(ClientOrderService).quoteBuilder).not.toHaveBeenCalled();
  });
  it('rejects an unsupported product height unit', async () => {
    await request(app.getHttpServer())
      .post('/business/CreateProduct')
      .set('Authorization', 'Bearer admin')
      .send({ ...product, NetHeightUnit: 'inch' })
      .expect(400);
  });
  it('passes pagination to the product service', async () => {
    await request(app.getHttpServer())
      .post('/business/GetProducts?pageSize=10&pageNumber=2')
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(200);
    expect(mocks.get(ProductService).getProduct).toHaveBeenCalledWith(
      { pageSize: '10', pageNumber: '2' },
      {},
    );
  });
  it.each(['getFile', 'deleteFile'])(
    'returns 404 for missing %s metadata',
    async (route) => {
      mocks.get(StorageService).GetFileInfo.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get(`/storage/${route}/missing`)
        .expect(404);
      expect(mocks.get(StorageService).DeleteDocument).not.toHaveBeenCalled();
    },
  );
  it('returns 404 when download metadata exists but the disk file is missing', async () => {
    mocks.get(StorageService).GetFileInfo.mockResolvedValue({
      FileLocation: directory,
      FileName: 'missing.txt',
    });
    await request(app.getHttpServer())
      .get('/storage/getFile/test-id')
      .expect(404);
  });
  it('uploads multipart content only into a temporary test directory', async () => {
    await request(app.getHttpServer())
      .post('/storage/uploadFile')
      .set('Authorization', 'Bearer admin')
      .field('customerId', 'customer-1')
      .attach('file', Buffer.from('fixture'), 'test.txt')
      .expect(200);
    expect(mocks.get(StorageService).UploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'test.txt', size: 7 }),
      user,
      'customer-1',
    );
  });

  it.each(['', '   ', '123', '01200000000', '017000000000', 1700000000])(
    'rejects invalid checkout contact phone %j',
    async (PhoneNumber) => {
      await request(app.getHttpServer())
        .post('/business/CreateClientOrder')
        .send({ ...order, PhoneNumber })
        .expect(400);
      expect(mocks.get(ClientOrderService).createOrder).not.toHaveBeenCalled();
    },
  );
  it('accepts a formatted Bangladesh mobile number without payment selection', async () => {
    await request(app.getHttpServer())
      .post('/business/CreateClientOrder')
      .send({ ...order, PhoneNumber: '+880 1700-000000' })
      .expect(200);
    expect(mocks.get(ClientOrderService).createOrder).toHaveBeenCalled();
  });
  it('accepts only boolean NeedsAction filters', async () => {
    await request(app.getHttpServer())
      .post('/business/ListOrders')
      .set('Authorization', 'Bearer admin')
      .send({ NeedsAction: 'true' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/business/ListOrders')
      .set('Authorization', 'Bearer admin')
      .send({ NeedsAction: true })
      .expect(200);
    expect(mocks.get(OrderOperationsService).list).toHaveBeenCalledWith(
      expect.objectContaining({ NeedsAction: true }),
      user,
    );
  });
});
