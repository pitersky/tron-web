const chai = require('chai');
const assert = chai.assert;
const txPars = require('../helpers/txPars');
const jlog = require('../helpers/jlog');
const ethUtil = require('eth-sig-util');
const assertThrow = require('../helpers/assertThrow');
const wait = require('../helpers/wait');
const broadcaster = require('../helpers/broadcaster');
const pollAccountFor = require('../helpers/pollAccountFor');
const _ = require('lodash');
const tronWebBuilder = require('../helpers/tronWebBuilder');
const assertEqualHex = require('../helpers/assertEqualHex');
const TronWeb = tronWebBuilder.TronWeb;
const config = require('../helpers/config');
const {ADDRESS_HEX, ADDRESS_BASE58, UPDATED_TEST_TOKEN_OPTIONS, PRIVATE_KEY} = config;

describe('TronWeb.trx', function () {

    let accounts;
    let tronWeb;
    let emptyAccount;

    before(async function () {
        tronWeb = tronWebBuilder.createInstance();
        // ALERT this works only with Tron Quickstart:
        accounts = await tronWebBuilder.getTestAccounts(-1);
        // emptyAccount = await TronWeb.createAccount();
    });

    describe('#constructor()', function () {

        it('should have been set a full instance in tronWeb', function () {

            assert.instanceOf(tronWeb.trx, TronWeb.Trx);
        });

    });

    describe("#multiSignTransaction", async function () {

        it.only('should sign a transaction', async function () {

            const transaction = await tronWeb.transactionBuilder.freezeBalance(100e6, 3, 'BANDWIDTH', accounts.b58[1])
            console.log(transaction.raw_data.contract)
            let signedTransaction = await tronWeb.trx.sign(transaction, accounts.pks[1]);


            signedTransaction = await tronWeb.trx.sign(signedTransaction, accounts.pks[2], null, true)

            assert.equal(signedTransaction.signature.length, 2)

        })

        it('should multi-sign transaction and verify weight', async function () {

            const threshold = 3;

            // update account permission
            let ownerAddress = accounts.hex[0];
            let ownerPk = accounts.pks[0];
            let ownerPermission = { type: 0, permission_name: 'owner' };
            ownerPermission.threshold = threshold;
            ownerPermission.keys  = [];
            let activePermission = { type: 2, permission_name: 'active0' };
            activePermission.threshold = threshold;
            activePermission.operations = '7fff1fc0037e0000000000000000000000000000000000000000000000000000';
            activePermission.keys = [];

            for (let i = 0; i < 5; i++) {
                let address = accounts.hex[i];
                let weight = 1;
                ownerPermission.keys.push({ address: address, weight: weight });
                activePermission.keys.push({ address: address, weight: weight });
            }

            const updateTransaction = await tronWeb.transactionBuilder.updateAccountPermissions(
                ownerAddress,
                ownerPermission,
                null,
                [activePermission]
            );
            assert.isTrue(updateTransaction.txID && updateTransaction.txID.length === 64);

            // broadcast update transaction
            const signedUpdateTransaction = await tronWeb.trx.sign(updateTransaction, ownerPk, null, false);
            await tronWeb.trx.broadcast(signedUpdateTransaction)

            // create transaction and do first sign
            const transaction = await tronWeb.transactionBuilder.sendTrx(accounts.hex[1], 10e8, accounts.hex[0]);

            // sign and verify sign weight
            let signedTransaction, signWeight;
            for (let i = 0; i < threshold; i++) {
                signedTransaction = await tronWeb.trx.sign(transaction, accounts.pks[i], null, true);
                signWeight = await tronWeb.trx.getSignWeight(signedTransaction);
                if (i == threshold - 1) {
                    assert.equal(signWeight.approved_list.length, threshold);
                } else {
                    assert.equal(signWeight.approved_list.length, i + 1);
                    assert.equal(signWeight.result.code, 'NOT_ENOUGH_PERMISSION');
                }
            }

            // get approved list
            const approvedList = await tronWeb.trx.getApprovedList(transaction);
            assert.isTrue(approvedList.approved_list.length === threshold);

            // broadcast multi-sign transaction
            const result = await tronWeb.trx.broadcast(signedTransaction);
            assert.isTrue(result.result);

        })

    });

    describe("#broadcast", async function () {

        let signedTransaction

        before(async function () {
            const transaction = await tronWeb.transactionBuilder.freezeBalance(100e6, 3, 'BANDWIDTH', accounts.b58[2])
            signedTransaction = await tronWeb.trx.sign(transaction, accounts.pks[2]);
        })

        it('should broadcast a transaction', async function () {

            this.timeout(20000)
            const result = await tronWeb.trx.broadcast(signedTransaction)
            assert.equal(result.transaction.signature[0], signedTransaction.signature[0])
        })
    });


    describe("#freezeBalance", async function () {

        let account;

        before(async function () {
            account = await tronWeb.trx.getAccount(accounts.b58[0]);
        });

        it('should freeze balance for energy or bandwidth', async function () {

            const resources = ['BANDWIDTH', 'ENERGY'];
            let res, parameter;

            for (let resource of resources) {
                res = await broadcaster(tronWeb.transactionBuilder.freezeBalance(100e6, 3, resource, accounts.b58[0]), accounts.pks[0]);
                assert.isTrue(res.receipt.result);

                parameter = txPars(res.receipt.transaction);
                assert.equal(parameter.value.resource ? parameter.value.resource : 'BANDWIDTH', resource);
                assert.equal(parameter.value.frozen_duration, 3);
                assert.equal(parameter.value.frozen_balance, 100e6);
                assert.equal(parameter.value.owner_address, accounts.hex[0]);
            }

        });

    });


    describe("#getAccount", async function () {

        it('should get account info by address', async function () {

            const addressTypes = ['hex', 'b58'];
            let account;

            for (let i = 0; i < 5; i++) {
                for (let type of addressTypes) {
                    account = await tronWeb.trx.getAccount(accounts[type][i]);
                    assert.equal(account.address, accounts.hex[i]);
                }
            }

        });

    });


    describe("#getAccountResources", async function () {

        it('should get account resource by address', async function () {

            const addressTypes = ['hex', 'b58'];
            const resource = [5000, 43200000000, 50000000000];
            let account;

            for (let i = 0; i < 5; i++) {
                for (let type of addressTypes) {
                    account = await tronWeb.trx.getAccountResources(accounts[type][i]);
                    assert.equal(account.freeNetLimit, resource[0]);
                    assert.equal(account.TotalNetLimit, resource[1]);
                    assert.equal(account.TotalEnergyLimit, resource[2]);
                }
            }

        });

    });


    describe("#getBalance", async function () {

        it('should get balance by address', async function () {

            const addressTypes = ['hex', 'b58'];
            let balance;

            for (let i = 0; i < 5; i++) {
                for (let type of addressTypes) {
                    balance = await tronWeb.trx.getBalance(accounts[type][i]);
                    assert.isTrue(!isNaN(balance));
                }
            }

        });

    });


    describe("#getBandwidth", async function () {

        it('should get bandwidth by address', async function () {

            const addressTypes = ['hex', 'b58'];
            let bp;

            for (let i = 0; i < 5; i++) {
                for (let type of addressTypes) {
                    bp = await tronWeb.trx.getBandwidth(accounts[type][i]);
                    assert.isTrue(!isNaN(bp));
                }
            }

        });

    });


    describe("#getBlock", async function () {

        it('should get block by address', async function () {

            const addressTypes = ['hex', 'b58'];
            let bp;

            for (let i = 0; i < 5; i++) {
                for (let type of addressTypes) {
                    bp = await tronWeb.trx.getBlock(accounts[type][i]);
                    assert.isTrue(!isNaN(bp));
                }
            }

        });

    });


    describe("#getBlockByHash", async function () {
    });
    describe("#getBlockByNumber", async function () {
    });
    describe("#getBlockRange", async function () {
    });
    describe("#getBlockTransactionCount", async function () {
    });
    describe("#getChainParameters", async function () {
    });
    describe("#getConfirmedTransaction", async function () {
    });
    describe("#getContract", async function () {
    });
    describe("#getCurrentBlock", async function () {
    });
    describe("#getExchangeByID", async function () {
    });
    describe("#getProposal", async function () {
    });
    describe("#getTokenFromID", async function () {
    });
    describe("#getTokensIssuedByAddress", async function () {
    });
    describe("#getTransaction", async function () {
    });
    describe("#getTransactionFromBlock", async function () {
    });
    describe("#getTransactionInfo", async function () {
    });
    describe("#getTransactionsFromAddress", async function () {
    });
    describe("#getTransactionsRelated", async function () {
    });
    describe("#getTransactionsToAddress", async function () {
    });
    describe("#getUnconfirmedAccount", async function () {
    });
    describe("#getUnconfirmedBalance", async function () {
    });
    describe("#listExchanges", async function () {
    });
    describe("#listExchangesPaginated", async function () {
    });
    describe("#listNodes", async function () {
    });
    describe("#listProposals", async function () {
    });
    describe("#listSuperRepresentatives", async function () {
    });
    describe("#listTokens", async function () {
    });
    describe("#parseToken", async function () {
    });
    describe("#send", async function () {
    });
    describe("#sendAsset", async function () {
    });
    describe("#sendToken", async function () {
    });
    describe("#sendTransaction", async function () {
    });
    describe("#sendTrx", async function () {
    });
    describe("#sign", async function () {
    });
    describe("#signMessage", async function () {
    });
    describe("#timeUntilNextVoteCycle", async function () {
    });
    describe("#unfreezeBalance", async function () {
    });
    describe("#updateAccount", async function () {
    });
    describe("#verifyMessage", async function () {
    });

});
