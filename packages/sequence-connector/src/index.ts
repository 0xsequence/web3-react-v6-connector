import { AbstractConnector } from '@web3-react/abstract-connector'
import { ConnectorUpdate } from '@web3-react/types'

declare const window: any

const supportedNetworks = [1, 137, 4, 5]

function parseChainId(chainId: string | number) {
  if (typeof chainId === 'number') {
    return chainId
  }
  return Number.parseInt(chainId, 16)
}

export interface SequenceConnectorArguments {
  chainId: number
  appName?: string
}

export class SequenceConnector extends AbstractConnector {
  private chainId: number
  private readonly appName: string

  public sequenceWallet: any
  public sequenceProvider: any

  constructor({ chainId, appName }: SequenceConnectorArguments) {
    super({ supportedChainIds: supportedNetworks.concat([chainId]) })

    this.chainId = chainId
    this.appName = appName || 'app'

    this.handleNetworkChanged = this.handleNetworkChanged.bind(this)
    this.handleChainChanged = this.handleChainChanged.bind(this)
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this)
    this.handleClose = this.handleClose.bind(this)
  }

  private handleChainChanged(chainId: string | number): void {
    this.emitUpdate({ chainId: parseChainId(chainId), provider: this.sequenceProvider })
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (accounts.length === 0) {
      this.deactivate()
    } else {
      this.emitUpdate({ account: accounts[0] })
    }
  }

  private handleClose(): void {
    this.deactivate()
  }

  private handleNetworkChanged(networkId: string | number): void {
    this.emitUpdate({ chainId: parseChainId(networkId), provider: this.sequenceProvider })
  }

  private listenToEvents() {
      this.sequenceProvider.on('chainChanged', this.handleChainChanged)
      this.sequenceProvider.on('accountsChanged', this.handleAccountsChanged)
      this.sequenceProvider.on('close', this.handleClose)
      this.sequenceProvider.on('networkChanged', this.handleNetworkChanged)
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (window?.ethereum && window.ethereum.isSequence) {
      this.sequenceProvider = window.ethereum;
      if (this.sequenceProvider) {
        await this.sequenceProvider.request({ method: 'eth_requestAccounts' })
        const [chainId, accounts] = await Promise.all([
          this.sequenceProvider.request({ method: 'eth_chainId' }) as Promise<string>,
          this.sequenceProvider.request({ method: 'eth_accounts' }) as Promise<string[]>,
        ])
        this.chainId = parseChainId(chainId)
        this.listenToEvents()
        return({ provider: this.sequenceProvider, account: accounts[0] })
      }
    }

    if (!this.sequenceWallet) {
      const sequence = await import('0xsequence').then(m => m?.sequence)
      const defaultNetwork = this.chainId || 137
      this.sequenceWallet = await sequence.initWallet(defaultNetwork);
    }

    if (!this.sequenceWallet.isConnected()) {
      const connectDetails = await this.sequenceWallet.connect({
        app: this.appName,
        authorize: true
      });

      if (!connectDetails.connected) {
        console.error('Failed to connect')
        throw (new Error("Failed to connect"))
      }
    }

    if (this.sequenceWallet.isConnected()) {
      // @ts-ignore
      this.sequenceProvider = this.sequenceWallet.getProvider();
      const walletAddress = await this.sequenceWallet.getAddress()
      const chainId = await this.sequenceWallet.getChainId()
      this.chainId = parseChainId(chainId)
      this.listenToEvents()
      return ({ provider: this.sequenceProvider, account: walletAddress })
    }

    console.error('Failed to connect')
    throw (new Error("Failed to connect"))
  }

  public async getProvider(): Promise<any> {
    return this.sequenceProvider
  }

  public async getChainId(): Promise<number | string> {
    return this.chainId
  }

  public async getAccount(): Promise<null | string> {
    return this.sequenceProvider.request({ method: 'eth_accounts' }).then((accounts: string[]): string => accounts[0])
  }

  public async deactivate() {
    if (this.sequenceWallet) {
      await this.sequenceWallet.disconnect()
    }
    if (this.sequenceProvider) {
      this.sequenceProvider.removeListener('chainChanged', this.handleChainChanged)
      this.sequenceProvider.removeListener('accountsChanged', this.handleAccountsChanged)
      this.sequenceProvider.removeListener('close', this.handleClose)
      this.sequenceProvider.removeListener('networkChanged', this.handleNetworkChanged)
    }
    this.sequenceWallet = undefined
    this.sequenceProvider = undefined
    this.emitDeactivate()
  }

  public async close() {
    await this.deactivate()
  }
}
