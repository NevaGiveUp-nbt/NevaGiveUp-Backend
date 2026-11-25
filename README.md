<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## GitHub Actions CI

[Backend CI](.github/workflows/ci.yml) chạy khi mở hoặc cập nhật PR vào `main`, push lên `main` và khi chọn **Run workflow** trong tab **Actions**. Runner dùng Node.js 24, cài theo lockfile, kiểm tra Prisma schema, generate Prisma Client, build NestJS và chạy các unit test Jest hiện có.

ESLint hiện ghi cảnh báo vì repo đang có lỗi lint. Sau khi xử lý các lỗi đó, bỏ `continue-on-error` và bước **Report existing lint issues** để yêu cầu lint pass. Jest chấp nhận khi chưa có unit test. Kiểm thử e2e trong `test/` cần môi trường tích hợp riêng vì khởi động toàn bộ `AppModule`.

## Deploy trên Render hoặc Railway

Kết nối repo backend với nhánh `main`. Tạo PostgreSQL và Redis, rồi cấu hình biến môi trường của service, gồm `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT` và các biến JWT, lưu trữ, mail, YouTube, thanh toán cần cho ứng dụng.

| Thiết lập | Render | Railway |
| --- | --- | --- |
| Chờ GitHub Actions | Auto-Deploy → After CI Checks Pass | Wait for CI |
| Node.js | `NODE_VERSION=24.20.0` | `RAILPACK_NODE_VERSION=24.20.0` |
| Cài dependencies | Đã nằm trong build command | Đặt `RAILPACK_INSTALL_CMD=npm ci --include=dev` và `RAILPACK_PRUNE_DEPS=false` |
| Build command | `npm ci --include=dev && npm exec -- prisma generate --generator client && npm run build` | `npm exec -- prisma generate --generator client && npm run build` |
| Start command | `npm run start:prod` | `npm run start:prod` |

Railway cần giữ dev dependencies vì repo hiện khai báo Prisma Client và CLI trong nhóm đó. [Thiết lập Render](https://render.com/docs/deploys) · [Railway Wait for CI](https://docs.railway.com/deployments/github-autodeploys) · [Tùy chọn Railpack cho Node.js](https://railpack.com/languages/node)

Sau khi kiểm tra migration trên database thử nghiệm, dùng `npm exec -- prisma migrate deploy` làm pre-deploy command. Với gói Render thiếu pre-deploy command, chạy migration riêng trước khi deploy phiên bản mới. GitHub Actions CI kiểm tra schema và build mà không cần thông tin kết nối database production. [Render pre-deploy](https://render.com/docs/deploys#pre-deploy-command) · [Railway pre-deploy](https://docs.railway.com/deployments/pre-deploy-command)

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
